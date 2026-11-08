// Court94 Backup & Restore
//
// Kept separate from script.js. It reads and writes the same localStorage
// keys the tracker uses (court94Teams, court94Games, court94LiveGameRecovery)
// and, after a successful restore, reloads the tracker's in-memory data so
// nothing stale can be saved over the restored data.
//
// Restore never deletes anything: items are only added, or replaced when the
// coach explicitly chooses "Use backup version" for a conflict.

const BACKUP_APP_NAME = "Court94";
const BACKUP_FORMAT_VERSION = 1;
const BACKUP_MAX_FILE_BYTES = 20 * 1024 * 1024;
const LIVE_GAME_STORAGE_KEY = "court94LiveGameRecovery";
const PRE_RESTORE_STORAGE_KEY = "court94PreRestoreBackup";

let pendingRestorePlan = null;
let restoreSafetyBackupSaved = false;

class BackupFileError extends Error {}

// ---------- Helpers ----------

function isPlainObject(value) {
    return (
        value !== null &&
        typeof value === "object" &&
        !Array.isArray(value)
    );
}

function isNonEmptyString(value) {
    return typeof value === "string" && value.trim() !== "";
}

function escapeBackupHtml(value) {
    return String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

function countLabel(count, singular, plural = `${singular}s`) {
    return `${count} ${count === 1 ? singular : plural}`;
}

// Compares records regardless of the order their fields were saved in.
function stableStringify(value) {
    if (Array.isArray(value)) {
        return `[${value.map(stableStringify).join(",")}]`;
    }

    if (isPlainObject(value)) {
        return `{${Object.keys(value)
            .filter((key) => value[key] !== undefined)
            .sort()
            .map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`)
            .join(",")}}`;
    }

    return JSON.stringify(value) ?? "null";
}

// Unlike loadTeams()/loadGames(), this throws if saved data is unreadable,
// so a backup or restore never mistakes damaged data for "no data".
function readStoredList(storageKey) {
    const raw = localStorage.getItem(storageKey);

    if (raw === null) {
        return [];
    }

    const parsed = JSON.parse(raw);

    if (parsed === null) {
        return [];
    }

    if (!Array.isArray(parsed)) {
        throw new Error(`Saved data "${storageKey}" is not a list.`);
    }

    return parsed;
}

function readRawCourt94Storage() {
    return {
        teams: localStorage.getItem(STORAGE_KEY),
        games: localStorage.getItem(GAMES_STORAGE_KEY),
        liveGame: localStorage.getItem(LIVE_GAME_STORAGE_KEY),
        preRestore: localStorage.getItem(PRE_RESTORE_STORAGE_KEY)
    };
}

function writeRawStorageValue(storageKey, raw) {
    if (raw === null) {
        localStorage.removeItem(storageKey);
    } else {
        localStorage.setItem(storageKey, raw);
    }
}

function restoreRawCourt94Storage(raw) {
    [
        [STORAGE_KEY, raw.teams],
        [GAMES_STORAGE_KEY, raw.games],
        [LIVE_GAME_STORAGE_KEY, raw.liveGame],
        [PRE_RESTORE_STORAGE_KEY, raw.preRestore]
    ].forEach(([storageKey, value]) => {
        try {
            writeRawStorageValue(storageKey, value);
        } catch (error) {
            console.error(
                `Court94 could not put back ${storageKey}:`,
                error
            );
        }
    });
}

function describeBackupTeam(team) {
    const name =
        [team.schoolName, team.teamName]
            .filter(Boolean)
            .join(" — ") || "Unnamed team";

    return team.season ? `${name} (${team.season})` : name;
}

function describeBackupGame(game, teamLookup) {
    const team = teamLookup.get(game.teamId);

    return `${team?.teamName || "Team"} vs ${game.opponent || "Opponent"}${
        game.gameDate ? ` · ${game.gameDate}` : ""
    }`;
}

// ---------- Export ----------

// The game in progress is taken from memory, which is the tracker's most
// current copy (a few Undo buttons update memory before localStorage).
function getLiveGameSnapshot() {
    if (!liveGameState) {
        return null;
    }

    return JSON.parse(
        JSON.stringify({
            liveGameState,
            liveActionHistory,
            selectedLivePlayerId,
            selectedTeamId,
            currentGameSetup
        })
    );
}

function buildCourt94Backup() {
    const backupTeams = readStoredList(STORAGE_KEY);
    const backupGames = readStoredList(GAMES_STORAGE_KEY);
    const liveGame = getLiveGameSnapshot();

    return {
        app: BACKUP_APP_NAME,
        backupFormat: BACKUP_FORMAT_VERSION,
        exportedAt: new Date().toISOString(),
        counts: {
            teams: backupTeams.length,
            games: backupGames.length,
            gameInProgress: Boolean(liveGame)
        },
        data: {
            teams: backupTeams,
            games: backupGames,
            liveGame
        }
    };
}

function formatBackupFileTime(date) {
    const pad = (number) => String(number).padStart(2, "0");

    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(
        date.getDate()
    )}-${pad(date.getHours())}${pad(date.getMinutes())}`;
}

function downloadCourt94File(fileName, text) {
    const blob = new Blob([text], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");

    link.href = url;
    link.download = fileName;
    link.style.display = "none";

    document.body.appendChild(link);
    link.click();
    link.remove();

    // iPad Safari needs the file link to stay valid for a moment.
    setTimeout(() => URL.revokeObjectURL(url), 60000);
}

function exportCourt94Backup(filePrefix) {
    const backup = buildCourt94Backup();
    const fileName =
        `${filePrefix}-${formatBackupFileTime(new Date())}.json`;

    downloadCourt94File(fileName, JSON.stringify(backup, null, 2));

    return { backup, fileName };
}

function describeBackupCounts(counts) {
    return `${countLabel(counts.teams, "team")}, ${countLabel(
        counts.games,
        "completed game"
    )}${counts.gameInProgress ? ", 1 game in progress" : ""}`;
}

// ---------- Validation ----------

function getTeamProblem(team) {
    if (!isPlainObject(team)) {
        return "a team entry is not in the expected format";
    }

    if (!isNonEmptyString(team.id)) {
        return "a team is missing its ID";
    }

    if (typeof team.teamName !== "string") {
        return "a team is missing its name";
    }

    if (!Array.isArray(team.roster)) {
        return `team "${team.teamName}" is missing its roster`;
    }

    const playerIds = new Set();

    for (const player of team.roster) {
        if (!isPlainObject(player) || !isNonEmptyString(player.id)) {
            return `team "${team.teamName}" has a player without an ID`;
        }

        if (playerIds.has(player.id)) {
            return `team "${team.teamName}" lists the same player twice`;
        }

        playerIds.add(player.id);
    }

    if (
        !Array.isArray(team.selectedTeamStats) ||
        !Array.isArray(team.selectedPlayerStats)
    ) {
        return `team "${team.teamName}" is missing its stat choices`;
    }

    return null;
}

function getGameProblem(game) {
    if (!isPlainObject(game)) {
        return "a game entry is not in the expected format";
    }

    if (!isNonEmptyString(game.id)) {
        return "a game is missing its ID";
    }

    if (!isNonEmptyString(game.teamId)) {
        return `the game vs ${game.opponent || "an unknown opponent"} is missing its team`;
    }

    if (
        !isPlainObject(game.teamStats) ||
        !isPlainObject(game.playerStatsById)
    ) {
        return `the game vs ${game.opponent || "an unknown opponent"} is missing its statistics`;
    }

    return null;
}

function getLiveGameProblem(liveGame) {
    if (
        !isPlainObject(liveGame) ||
        !isPlainObject(liveGame.liveGameState)
    ) {
        return "the game in progress is not in the expected format";
    }

    const state = liveGame.liveGameState;

    if (!isNonEmptyString(state.teamId)) {
        return "the game in progress is missing its team";
    }

    if (
        !isPlainObject(state.teamStats) ||
        !isPlainObject(state.playerStatsById) ||
        !isPlainObject(state.teamStatsByPeriod) ||
        !isPlainObject(state.playerStatsByPeriod)
    ) {
        return "the game in progress is missing its statistics";
    }

    if (
        !Array.isArray(state.currentFive) ||
        !isNonEmptyString(state.period)
    ) {
        return "the game in progress is missing its lineup or period";
    }

    if (
        liveGame.liveActionHistory !== undefined &&
        liveGame.liveActionHistory !== null &&
        !Array.isArray(liveGame.liveActionHistory)
    ) {
        return "the game in progress has an unreadable Undo history";
    }

    return null;
}

function parseCourt94Backup(text) {
    if (typeof text !== "string" || text.trim() === "") {
        throw new BackupFileError("This file is empty. Nothing was restored.");
    }

    if (text.length > BACKUP_MAX_FILE_BYTES) {
        throw new BackupFileError(
            "This file is too large to be a Court94 backup. Nothing was restored."
        );
    }

    let backup;

    try {
        backup = JSON.parse(text);
    } catch (error) {
        throw new BackupFileError(
            "This file isn't a Court94 backup. Nothing was restored."
        );
    }

    if (
        !isPlainObject(backup) ||
        backup.app !== BACKUP_APP_NAME ||
        !isPlainObject(backup.data)
    ) {
        throw new BackupFileError(
            "This file isn't a Court94 backup. Nothing was restored."
        );
    }

    if (
        !Number.isInteger(backup.backupFormat) ||
        backup.backupFormat < 1
    ) {
        throw new BackupFileError(
            "This backup's format isn't recognized. Nothing was restored."
        );
    }

    if (backup.backupFormat > BACKUP_FORMAT_VERSION) {
        throw new BackupFileError(
            "This backup was made by a newer version of Court94. Update Court94, then try again. Nothing was restored."
        );
    }

    const backupTeams = backup.data.teams;
    const backupGames = backup.data.games;
    const backupLiveGame = backup.data.liveGame;

    if (!Array.isArray(backupTeams) || !Array.isArray(backupGames)) {
        throw new BackupFileError(
            "This backup is missing its teams or games. Nothing was restored."
        );
    }

    const problems = [
        ...backupTeams.map(getTeamProblem),
        ...backupGames.map(getGameProblem),
        backupLiveGame == null ? null : getLiveGameProblem(backupLiveGame)
    ].filter(Boolean);

    if (problems.length > 0) {
        const extra =
            problems.length > 3
                ? ` (and ${problems.length - 3} more)`
                : "";

        throw new BackupFileError(
            `This backup contains damaged or unexpected data, so nothing was restored: ${problems
                .slice(0, 3)
                .join("; ")}${extra}.`
        );
    }

    return backup;
}

// ---------- Restore planning ----------

function compareRecords(currentList, backupList) {
    const currentById = new Map();

    currentList.forEach((item) => {
        if (!currentById.has(item.id)) {
            currentById.set(item.id, item);
        }
    });

    const seenIds = new Set();
    const changes = {
        add: [],
        same: [],
        conflicts: [],
        duplicatesInFile: 0
    };

    backupList.forEach((item) => {
        if (seenIds.has(item.id)) {
            changes.duplicatesInFile += 1;
            return;
        }

        seenIds.add(item.id);

        const current = currentById.get(item.id);

        if (!current) {
            changes.add.push(item);
        } else if (stableStringify(current) === stableStringify(item)) {
            changes.same.push(item);
        } else {
            changes.conflicts.push({
                id: item.id,
                current,
                backup: item,
                locked: false
            });
        }
    });

    return changes;
}

function analyzeCourt94Backup(backup) {
    const originalRaw = readRawCourt94Storage();
    const currentTeams = readStoredList(STORAGE_KEY);
    const currentGames = readStoredList(GAMES_STORAGE_KEY);

    const teamChanges = compareRecords(currentTeams, backup.data.teams);
    const gameChanges = compareRecords(currentGames, backup.data.games);

    // The team being tracked in a live game can't be replaced mid-game.
    const activeTeamId = liveGameState ? liveGameState.teamId : null;

    teamChanges.conflicts.forEach((conflict) => {
        conflict.locked = conflict.id === activeTeamId;
    });

    const knownTeamIds = new Set(
        [...currentTeams, ...teamChanges.add].map((team) => team.id)
    );

    const orphanGames = gameChanges.add.filter(
        (game) => !knownTeamIds.has(game.teamId)
    ).length;

    let liveGame = null;

    if (backup.data.liveGame) {
        const state = backup.data.liveGame.liveGameState;
        let blockedReason = null;

        if (liveGameState) {
            blockedReason =
                "This device already has a game in progress, so the backup's game in progress will not be restored. The game on this device will not be changed.";
        } else if (!knownTeamIds.has(state.teamId)) {
            blockedReason =
                "The team for this game isn't on this device or in the backup, so it can't be restored.";
        }

        const possibleDuplicate = [
            ...currentGames,
            ...gameChanges.add
        ].some((game) => {
            return (
                game.teamId === state.teamId &&
                game.opponent === state.opponent &&
                game.gameDate === state.gameDate
            );
        });

        liveGame = {
            snapshot: backup.data.liveGame,
            blockedReason,
            possibleDuplicate
        };
    }

    return {
        backup,
        originalRaw,
        currentTeams,
        currentGames,
        teamChanges,
        gameChanges,
        orphanGames,
        liveGame
    };
}

function planHasChanges(plan) {
    return Boolean(
        plan.teamChanges.add.length ||
        plan.gameChanges.add.length ||
        plan.teamChanges.conflicts.length ||
        plan.gameChanges.conflicts.length ||
        (plan.liveGame && !plan.liveGame.blockedReason)
    );
}

// ---------- Restore ----------

function applyCourt94Restore(plan, choices = {}) {
    const useBackupTeamIds = new Set(choices.useBackupTeamIds || []);
    const useBackupGameIds = new Set(choices.useBackupGameIds || []);

    const currentRaw = readRawCourt94Storage();

    if (
        currentRaw.teams !== plan.originalRaw.teams ||
        currentRaw.games !== plan.originalRaw.games ||
        currentRaw.liveGame !== plan.originalRaw.liveGame
    ) {
        throw new BackupFileError(
            "Court94 data on this device changed after the backup was reviewed. Nothing was restored. Please choose the backup file again."
        );
    }

    const restoreLiveGame = Boolean(
        choices.restoreLiveGame &&
        plan.liveGame &&
        !plan.liveGame.blockedReason &&
        !liveGameState
    );

    const activeTeamId = liveGameState ? liveGameState.teamId : null;

    const teamsToReplace = new Map(
        plan.teamChanges.conflicts
            .filter((conflict) => {
                return (
                    !conflict.locked &&
                    conflict.id !== activeTeamId &&
                    useBackupTeamIds.has(conflict.id)
                );
            })
            .map((conflict) => [conflict.id, conflict.backup])
    );

    const gamesToReplace = new Map(
        plan.gameChanges.conflicts
            .filter((conflict) => useBackupGameIds.has(conflict.id))
            .map((conflict) => [conflict.id, conflict.backup])
    );

    const mergedTeams = [
        ...plan.currentTeams.map(
            (team) => teamsToReplace.get(team.id) || team
        ),
        ...plan.teamChanges.add
    ];

    const mergedGames = [
        ...plan.currentGames.map(
            (game) => gamesToReplace.get(game.id) || game
        ),
        ...plan.gameChanges.add
    ];

    const writes = [
        [STORAGE_KEY, JSON.stringify(mergedTeams)],
        [GAMES_STORAGE_KEY, JSON.stringify(mergedGames)]
    ];

    if (restoreLiveGame) {
        writes.push([
            LIVE_GAME_STORAGE_KEY,
            JSON.stringify(plan.liveGame.snapshot)
        ]);
    }

    // Extra on-device safety copy (in addition to the downloaded file).
    let safetyCopySaved = false;

    try {
        localStorage.setItem(
            PRE_RESTORE_STORAGE_KEY,
            JSON.stringify({
                savedAt: new Date().toISOString(),
                teams: currentRaw.teams,
                games: currentRaw.games,
                liveGame: currentRaw.liveGame
            })
        );
        safetyCopySaved = true;
    } catch (error) {
        console.warn(
            "Court94 could not store the on-device safety copy:",
            error
        );
    }

    try {
        writes.forEach(([storageKey, value]) => {
            localStorage.setItem(storageKey, value);
        });

        writes.forEach(([storageKey, value]) => {
            if (localStorage.getItem(storageKey) !== value) {
                throw new Error(`Verification failed for ${storageKey}`);
            }
        });
    } catch (error) {
        console.error("Court94 restore failed:", error);
        restoreRawCourt94Storage(currentRaw);

        throw new BackupFileError(
            "Court94 couldn't finish saving the restore, so your original data was put back. Nothing was changed."
        );
    }

    // The restored games and game in progress are the newest saves now
    // (safetycopy.js), so an older safety copy can never replace them.
    if (typeof copyGameSave === "function") {
        copyGameSave();
    }

    // The restored game in progress is this page's own save (script.js), not
    // a change made in another tab.
    lastSavedRecoveryText = localStorage.getItem(LIVE_GAME_STORAGE_KEY);

    // Storage is now correct. Reload the tracker's in-memory copies from it
    // so later saves can't write stale data over the restore.
    teams = loadTeams();
    savedGames = loadGames();

    if (restoreLiveGame) {
        const snapshot = JSON.parse(
            localStorage.getItem(LIVE_GAME_STORAGE_KEY)
        );

        liveGameState = snapshot.liveGameState;
        liveActionHistory = snapshot.liveActionHistory || [];
        selectedLivePlayerId = snapshot.selectedLivePlayerId || null;
        selectedTeamId =
            snapshot.selectedTeamId || snapshot.liveGameState.teamId;
        currentGameSetup = snapshot.currentGameSetup || null;
        pendingSubOutPlayerIds = [];
        pendingSubInPlayerIds = [];
    }

    try {
        updateAppTeamBadge();
        renderTeams();
    } catch (error) {
        console.error("Court94 could not refresh the screen:", error);
    }

    return {
        addedTeams: plan.teamChanges.add.length,
        addedGames: plan.gameChanges.add.length,
        replacedTeams: teamsToReplace.size,
        replacedGames: gamesToReplace.size,
        keptTeams:
            plan.teamChanges.conflicts.length - teamsToReplace.size,
        keptGames:
            plan.gameChanges.conflicts.length - gamesToReplace.size,
        skippedTeams: plan.teamChanges.same.length,
        skippedGames: plan.gameChanges.same.length,
        liveGameRestored: restoreLiveGame,
        safetyCopySaved
    };
}

function openRestoredLiveGame() {
    if (!liveGameState || !getSelectedTeam()) {
        return;
    }

    renderLiveGame();
    showScreen("liveGame");
}

// ---------- Screen ----------

function getRestorePanel() {
    return document.getElementById("restorePanel");
}

function closeRestorePanel() {
    const panel = getRestorePanel();

    pendingRestorePlan = null;
    restoreSafetyBackupSaved = false;

    if (panel) {
        panel.innerHTML = "";
        panel.hidden = true;
    }
}

function showRestoreMessage(message) {
    const panel = getRestorePanel();

    pendingRestorePlan = null;
    restoreSafetyBackupSaved = false;

    panel.innerHTML = `
        <h3>Restore from Backup</h3>
        <p class="restoreError">${escapeBackupHtml(message)}</p>
        <div class="formActions">
            <button class="cancelButton" type="button" data-restore-action="close">
                Close
            </button>
        </div>
    `;
    panel.hidden = false;
    panel.scrollIntoView({ behavior: "smooth", block: "start" });
}

function renderConflictRows(conflicts, kind, teamLookup) {
    return conflicts
        .map((conflict) => {
            const name =
                kind === "team"
                    ? describeBackupTeam(conflict.current)
                    : describeBackupGame(conflict.current, teamLookup);

            const detail =
                kind === "team"
                    ? `On this device: ${countLabel(
                          conflict.current.roster.length,
                          "player"
                      )} · In backup: ${countLabel(
                          conflict.backup.roster.length,
                          "player"
                      )}`
                    : `On this device: ${conflict.current.teamScore ?? "—"}-${
                          conflict.current.opponentScore ?? "—"
                      } · In backup: ${conflict.backup.teamScore ?? "—"}-${
                          conflict.backup.opponentScore ?? "—"
                      }`;

            const groupName = `restoreConflict-${kind}-${conflict.id}`;
            const dataAttribute =
                kind === "team"
                    ? "data-use-backup-team"
                    : "data-use-backup-game";

            return `
                <div class="restoreConflict">
                    <strong>${escapeBackupHtml(name)}</strong>
                    <small>${escapeBackupHtml(detail)}</small>

                    <label>
                        <input type="radio" name="${escapeBackupHtml(groupName)}" value="keep" checked>
                        <span>Keep current version</span>
                    </label>

                    <label>
                        <input
                            type="radio"
                            name="${escapeBackupHtml(groupName)}"
                            value="backup"
                            ${dataAttribute}="${escapeBackupHtml(conflict.id)}"
                            ${conflict.locked ? "disabled" : ""}
                        >
                        <span>Use backup version</span>
                    </label>

                    ${
                        conflict.locked
                            ? `<p class="restoreWarning">This team is being used in the game in progress, so it can't be replaced right now.</p>`
                            : ""
                    }
                </div>
            `;
        })
        .join("");
}

function renderRestoreReview(plan) {
    const panel = getRestorePanel();
    const { backup, teamChanges, gameChanges, liveGame } = plan;

    const teamLookup = new Map(
        [...backup.data.teams, ...plan.currentTeams].map((team) => [
            team.id,
            team
        ])
    );

    const exportedAt = new Date(backup.exportedAt);
    const exportedLabel = Number.isNaN(exportedAt.getTime())
        ? "an unknown date"
        : exportedAt.toLocaleString();

    const backupCounts = {
        teams: backup.data.teams.length,
        games: backup.data.games.length,
        gameInProgress: Boolean(backup.data.liveGame)
    };

    const summaryItems = [];

    if (teamChanges.add.length) {
        summaryItems.push(
            `Add ${countLabel(teamChanges.add.length, "team")}: ${teamChanges.add
                .map(describeBackupTeam)
                .join(", ")}`
        );
    }

    if (gameChanges.add.length) {
        summaryItems.push(
            `Add ${countLabel(gameChanges.add.length, "completed game")}`
        );
    }

    if (teamChanges.same.length || gameChanges.same.length) {
        summaryItems.push(
            `Skip ${countLabel(teamChanges.same.length, "team")} and ${countLabel(
                gameChanges.same.length,
                "game"
            )} already on this device`
        );
    }

    const duplicates =
        teamChanges.duplicatesInFile + gameChanges.duplicatesInFile;

    if (duplicates) {
        summaryItems.push(
            `Ignore ${countLabel(duplicates, "duplicate copy", "duplicate copies")} inside the backup file`
        );
    }

    if (plan.orphanGames) {
        summaryItems.push(
            `${countLabel(plan.orphanGames, "game")} belong to a team that isn't on this device or in the backup. They will be kept, but won't appear until that team exists.`
        );
    }

    const conflictCount =
        teamChanges.conflicts.length + gameChanges.conflicts.length;

    const conflictSection = conflictCount
        ? `
            <h4>Different from this device</h4>
            <p class="formNote restoreNote">
                These items are already on this device but differ from the backup.
                The current version is kept unless you choose otherwise.
            </p>
            ${renderConflictRows(teamChanges.conflicts, "team", teamLookup)}
            ${renderConflictRows(gameChanges.conflicts, "game", teamLookup)}
        `
        : "";

    let liveGameSection = "";

    if (liveGame) {
        const state = liveGame.snapshot.liveGameState;
        const liveGameLabel = `${describeBackupGame(state, teamLookup)} · ${state.period}`;

        liveGameSection = `
            <h4>Game in progress</h4>
            <p>${escapeBackupHtml(liveGameLabel)}</p>
            ${
                liveGame.blockedReason
                    ? `<p class="restoreWarning">${escapeBackupHtml(liveGame.blockedReason)}</p>`
                    : `
                        ${
                            liveGame.possibleDuplicate
                                ? `<p class="restoreWarning">A completed game with the same team, opponent and date is already saved. This game may already be finished. Restoring and saving it again would create a duplicate.</p>`
                                : ""
                        }
                        <label class="restoreCheckbox">
                            <input type="checkbox" id="restoreLiveGameCheckbox">
                            <span>Restore this game in progress (only if it was not finished and saved)</span>
                        </label>
                    `
            }
        `;
    }

    if (!planHasChanges(plan)) {
        panel.innerHTML = `
            <h3>Restore from Backup</h3>
            <p>Backup made ${escapeBackupHtml(exportedLabel)}: ${escapeBackupHtml(describeBackupCounts(backupCounts))}.</p>
            <p class="restoreSuccess">Everything in this backup is already on this device. Nothing needs to be restored.</p>
            ${liveGameSection}
            <div class="formActions">
                <button class="cancelButton" type="button" data-restore-action="close">
                    Close
                </button>
            </div>
        `;
        panel.hidden = false;
        panel.scrollIntoView({ behavior: "smooth", block: "start" });
        return;
    }

    panel.innerHTML = `
        <h3>Review Restore</h3>
        <p>Backup made ${escapeBackupHtml(exportedLabel)}: ${escapeBackupHtml(describeBackupCounts(backupCounts))}.</p>

        <h4>What will happen</h4>
        <ul class="restoreList">
            ${
                summaryItems.length
                    ? summaryItems
                          .map((item) => `<li>${escapeBackupHtml(item)}</li>`)
                          .join("")
                    : "<li>No new teams or games to add.</li>"
            }
            <li>Nothing on this device will be deleted.</li>
        </ul>

        ${conflictSection}
        ${liveGameSection}

        <h4>Step 1: Save a safety backup of this device</h4>
        <p class="formNote restoreNote">
            Before anything changes, download a copy of everything currently on this device.
            Keep it until you've checked the restored teams and games.
        </p>
        <div class="backupActions">
            <button class="secondaryButton" type="button" data-restore-action="safety">
                Download Safety Backup
            </button>
        </div>
        <p id="safetyBackupStatus" class="backupStatus" role="status"></p>
        <label class="restoreCheckbox">
            <input type="checkbox" id="safetyBackupConfirm" disabled>
            <span>I have saved the safety backup file</span>
        </label>

        <h4>Step 2: Restore</h4>
        <div class="formActions">
            <button class="cancelButton" type="button" data-restore-action="cancel">
                Cancel
            </button>
            <button
                id="applyRestoreButton"
                class="saveButton"
                type="button"
                data-restore-action="apply"
                disabled
            >
                Restore
            </button>
        </div>
    `;
    panel.hidden = false;
    panel.scrollIntoView({ behavior: "smooth", block: "start" });
}

function updateApplyRestoreButton() {
    const applyButton = document.getElementById("applyRestoreButton");
    const confirmBox = document.getElementById("safetyBackupConfirm");

    if (applyButton) {
        applyButton.disabled = !(
            restoreSafetyBackupSaved && confirmBox?.checked
        );
    }
}

function downloadSafetyBackup() {
    const status = document.getElementById("safetyBackupStatus");
    const confirmBox = document.getElementById("safetyBackupConfirm");

    try {
        const { backup, fileName } = exportCourt94Backup(
            "court94-safety-backup"
        );

        restoreSafetyBackupSaved = true;

        if (confirmBox) {
            confirmBox.disabled = false;
        }

        if (status) {
            status.textContent = `Safety backup downloaded as ${fileName} (${describeBackupCounts(backup.counts)}).`;
        }
    } catch (error) {
        console.error("Court94 safety backup failed:", error);

        if (status) {
            status.textContent =
                "Court94 couldn't create the safety backup, so the restore can't continue. Nothing was changed.";
        }
    }

    updateApplyRestoreButton();
}

function renderRestoreResult(result) {
    const panel = getRestorePanel();
    const lines = [
        `Added ${countLabel(result.addedTeams, "team")} and ${countLabel(result.addedGames, "completed game")}.`
    ];

    if (result.replacedTeams || result.replacedGames) {
        lines.push(
            `Replaced with the backup version: ${countLabel(result.replacedTeams, "team")}, ${countLabel(result.replacedGames, "game")}.`
        );
    }

    if (result.keptTeams || result.keptGames) {
        lines.push(
            `Kept the current version: ${countLabel(result.keptTeams, "team")}, ${countLabel(result.keptGames, "game")}.`
        );
    }

    if (result.skippedTeams || result.skippedGames) {
        lines.push(
            `Already on this device: ${countLabel(result.skippedTeams, "team")}, ${countLabel(result.skippedGames, "game")}.`
        );
    }

    if (result.liveGameRestored) {
        lines.push("The game in progress was restored.");
    }

    panel.innerHTML = `
        <h3>Restore Complete</h3>
        <p class="restoreSuccess">Your backup was restored. Nothing on this device was deleted.</p>
        <ul class="restoreList">
            ${lines.map((line) => `<li>${escapeBackupHtml(line)}</li>`).join("")}
        </ul>
        <p class="formNote restoreNote">
            Keep your safety backup file until you've checked your teams and games.
        </p>
        <div class="formActions">
            ${
                result.liveGameRestored
                    ? `<button class="secondaryButton" type="button" data-restore-action="openLiveGame">Open Game in Progress</button>`
                    : ""
            }
            <button class="saveButton" type="button" data-restore-action="close">
                Done
            </button>
        </div>
    `;
    panel.hidden = false;
    panel.scrollIntoView({ behavior: "smooth", block: "start" });

    pendingRestorePlan = null;
    restoreSafetyBackupSaved = false;
}

function confirmAndApplyRestore() {
    const plan = pendingRestorePlan;
    const panel = getRestorePanel();
    const confirmBox = document.getElementById("safetyBackupConfirm");

    if (!plan || !restoreSafetyBackupSaved || !confirmBox?.checked) {
        return;
    }

    const useBackupTeamIds = [
        ...panel.querySelectorAll("[data-use-backup-team]:checked")
    ].map((input) => input.dataset.useBackupTeam);

    const useBackupGameIds = [
        ...panel.querySelectorAll("[data-use-backup-game]:checked")
    ].map((input) => input.dataset.useBackupGame);

    const restoreLiveGame = Boolean(
        document.getElementById("restoreLiveGameCheckbox")?.checked
    );

    const teamLookup = new Map(
        [...plan.backup.data.teams, ...plan.currentTeams].map((team) => [
            team.id,
            team
        ])
    );

    const replaceNames = [
        ...plan.teamChanges.conflicts
            .filter((conflict) => useBackupTeamIds.includes(conflict.id))
            .map((conflict) => describeBackupTeam(conflict.current)),
        ...plan.gameChanges.conflicts
            .filter((conflict) => useBackupGameIds.includes(conflict.id))
            .map((conflict) => describeBackupGame(conflict.current, teamLookup))
    ];

    if (replaceNames.length > 0) {
        const confirmed = window.confirm(
            `Replace ${countLabel(replaceNames.length, "item")} on this device with the backup version?\n\n` +
            `${replaceNames.map((name) => `• ${name}`).join("\n")}\n\n` +
            "The current version will be replaced. Your safety backup file is the only way to get it back."
        );

        if (!confirmed) {
            return;
        }
    }

    try {
        const result = applyCourt94Restore(plan, {
            useBackupTeamIds,
            useBackupGameIds,
            restoreLiveGame
        });

        renderRestoreResult(result);

        // Show the new restore safety copy and updated storage (storage.js).
        if (typeof refreshStorageSettings === "function") {
            refreshStorageSettings();
        }
    } catch (error) {
        showRestoreMessage(
            error instanceof BackupFileError
                ? error.message
                : "Something went wrong, so nothing was restored. Your data was not changed."
        );
    }
}

function reviewRestoreText(text) {
    pendingRestorePlan = null;
    restoreSafetyBackupSaved = false;

    let backup;

    try {
        backup = parseCourt94Backup(text);
    } catch (error) {
        showRestoreMessage(
            error instanceof BackupFileError
                ? error.message
                : "This file isn't a Court94 backup. Nothing was restored."
        );
        return;
    }

    try {
        pendingRestorePlan = analyzeCourt94Backup(backup);
    } catch (error) {
        console.error("Court94 could not read the current data:", error);
        showRestoreMessage(
            "Court94 couldn't read the data currently on this device, so the restore was stopped to protect it. Nothing was changed."
        );
        return;
    }

    renderRestoreReview(pendingRestorePlan);
}

// ---------- Wiring ----------

function connectBackupControls() {
    const downloadButton = document.getElementById("downloadBackupButton");
    const chooseFileButton = document.getElementById("chooseRestoreFileButton");
    const fileInput = document.getElementById("restoreBackupInput");
    const backupStatus = document.getElementById("backupStatus");
    const panel = getRestorePanel();

    if (!downloadButton || !chooseFileButton || !fileInput || !panel) {
        return;
    }

    downloadButton.addEventListener("click", () => {
        try {
            const { backup, fileName } = exportCourt94Backup("court94-backup");

            backupStatus.textContent =
                `Backup downloaded as ${fileName} (${describeBackupCounts(backup.counts)}).`;
        } catch (error) {
            console.error("Court94 backup failed:", error);
            backupStatus.textContent =
                "Court94 couldn't read the data on this device, so no backup was made. Nothing was changed.";
        }
    });

    chooseFileButton.addEventListener("click", () => {
        fileInput.click();
    });

    fileInput.addEventListener("change", () => {
        const file = fileInput.files && fileInput.files[0];

        // Clear so choosing the same file again still triggers a review.
        fileInput.value = "";

        if (!file) {
            return;
        }

        if (file.size > BACKUP_MAX_FILE_BYTES) {
            showRestoreMessage(
                "This file is too large to be a Court94 backup. Nothing was restored."
            );
            return;
        }

        const reader = new FileReader();

        reader.onload = () => reviewRestoreText(String(reader.result));
        reader.onerror = () => {
            showRestoreMessage(
                "Court94 couldn't read that file. Nothing was restored."
            );
        };

        reader.readAsText(file);
    });

    // One delegated listener for everything inside the review panel, so
    // re-rendering the panel never stacks up duplicate handlers.
    panel.addEventListener("click", (event) => {
        const button = event.target.closest("[data-restore-action]");

        if (!button || button.disabled) {
            return;
        }

        const action = button.dataset.restoreAction;

        if (action === "safety") {
            downloadSafetyBackup();
        } else if (action === "apply") {
            confirmAndApplyRestore();
        } else if (action === "openLiveGame") {
            closeRestorePanel();
            openRestoredLiveGame();
        } else if (action === "cancel" || action === "close") {
            closeRestorePanel();
        }
    });

    panel.addEventListener("change", (event) => {
        if (event.target.id === "safetyBackupConfirm") {
            updateApplyRestoreButton();
        }
    });

    // Start fresh each time Settings is opened.
    document
        .getElementById("settingsBtn")
        ?.addEventListener("click", () => {
            closeRestorePanel();
            backupStatus.textContent = "";
        });
}

connectBackupControls();
