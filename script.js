const STORAGE_KEY = "court94Teams";
const GAMES_STORAGE_KEY = "court94Games";

// The storage space check (storage.js) briefly writes a filler value here and
// removes it straight away. If the app was closed during a check, remove the
// leftover before anything else is saved.
const STORAGE_CHECK_KEY = "court94StorageCheck";

try {
    localStorage.removeItem(STORAGE_CHECK_KEY);
} catch (error) {
    console.error("Court94 could not clear the storage check:", error);
}

const teamStats = [
    {
        key: "offensiveRebounds",
        name: "Offensive Rebounds",
        description: "Track team offensive rebounds."
    },
    {
        key: "defensiveRebounds",
        name: "Defensive Rebounds",
        description: "Track team defensive rebounds."
    },
    {
    key: "turnovers",
    name: "Team Turnovers",
    description: "Track your team's turnovers."
},
{   
        key: "forcedTurnovers",
        name: "Forced Turnovers",
        description: "Turnovers created by your defense."
    },
    {
        key: "teamFouls",
        name: "Team Fouls",
        description: "Track total team fouls."
    },
    {
        key: "fieldGoals",
        name: "FGM, FGA and FG%",
        description: "Record makes and misses; Court94 calculates FG%."
    },
    {
    key: "threePointers",
    name: "3PM, 3PA and 3P%",
    description: "Record makes and misses; Court94 calculates 3P%."
},
    {
    key: "freeThrows",
    name: "FTM, FTA and FT%",
    description: "Record makes and misses; Court94 calculates FT%."
},
    {
        key: "paintTouches",
        name: "Paint Touches",
        description: "Track offensive possessions that reach the paint."
    },
    {
        key: "transitionPoints",
        name: "Transition Points",
        description: "Track points scored in transition."
    },
    {
        key: "opponentOffensiveRebounds",
        name: "Opp. Off Rebs",
        description: "Track second-chance opportunities allowed."
    }
];

const playerStats = [
    {
        key: "points",
        name: "Points",
        description: "Track player scoring."
    },
    {
        key: "individualShooting",
        name: "Individual Shooting Stats",
        description: "Adds FT, 2PT and 3PT Miss buttons to player cards. Turns on Points."
    },
    {
        key: "assists",
        name: "Assists",
        description: "Track passes that directly create baskets."
    },
    {
        key: "steals",
        name: "Steals",
        description: "Track player steals."
    },
    {
        key: "blocks",
        name: "Blocks",
        description: "Track blocked shots."
    },
    {
        key: "fouls",
        name: "Fouls",
        description: "Track individual player fouls."
    },
    {
        key: "offensiveRebounds",
        name: "Offensive Rebounds",
        shortName: "Off Rebs",
        description: "Track individual offensive rebounds."
    },
    {
        key: "defensiveRebounds",
        name: "Defensive Rebounds",
        shortName: "Def Rebs",
        description: "Track individual defensive rebounds."
    },
    {
        key: "turnovers",
        name: "Turnovers",
        description: "Track individual player turnovers."
    }
];

// Player-stat choices that switch a feature on instead of adding a counter.
const playerStatSettings = ["individualShooting"];

// True for player stats that get their own button and summary column
// (not Points, which uses +1/+2/+3, and not settings).
function isPlayerCounterStat(statKey) {
    return (
        statKey !== "points" &&
        !playerStatSettings.includes(statKey)
    );
}

// Individual Shooting Stats needs Points.
function normalizePlayerStatSelection(statKeys) {
    return statKeys.includes("points")
        ? statKeys
        : statKeys.filter((statKey) => statKey !== "individualShooting");
}

function hasIndividualShooting(statKeys) {
    return (
        statKeys.includes("points") &&
        statKeys.includes("individualShooting")
    );
}

// A stat's full name for sorting (unknown keys sort last).
function getStatName(statList, statKey) {
    return (
        statList.find((stat) => stat.key === statKey)?.name ||
        "￿"
    );
}

// Team-stat choices that switch a feature on instead of adding a team stat.
// They aren't in teamStats, so team stat cards and tables skip them.
const teamStatSettings = [
    {
        key: "opponentScoring",
        name: "Opponent Scoring",
        description: "Red +1/+2/+3 buttons for opponent baskets. Needed for lineup plus/minus."
    }
];

// Every choice shown in the Team Statistics checkboxes.
function getTeamStatChoices() {
    return [...teamStats, ...teamStatSettings];
}

function isTeamStatSetting(statKey) {
    return teamStatSettings.some((setting) => setting.key === statKey);
}

// Individual shooting coverage for a game in progress or a saved game:
// "full"    — on from the start and never turned off,
// "partial" — on for only part of the game,
// "none"    — never on.
// It's stored on the game itself (shootingCoverage), not as a player stat.
// Games started before coverage was recorded never count as "full".
function getShootingCoverage(game) {
    if (["full", "partial", "none"].includes(game?.shootingCoverage)) {
        return game.shootingCoverage;
    }

    return hasIndividualShooting(game?.selectedPlayerStats || [])
        ? "partial"
        : "none";
}

// Coverage after Edit Game Setup changes the player stats mid-game.
// Any change to the setting makes the game partial, permanently.
function getNextShootingCoverage(game, newStatKeys) {
    const settingChanged =
        hasIndividualShooting(game.selectedPlayerStats || []) !==
        hasIndividualShooting(newStatKeys);

    return settingChanged ? "partial" : getShootingCoverage(game);
}

let teams = loadTeams();
let savedGames = loadGames();
let editingTeamId = null;
let selectedTeamId = null;
let currentGameSetup = null;
let liveGameState = null;
let selectedLivePlayerId = null;
let pendingSubOutPlayerIds = [];
let pendingSubInPlayerIds = [];
let liveActionHistory = [];
let viewingSavedGame = false;
let editingLiveGameSetup = false;
const screens = {
    home: document.getElementById("homeScreen"),
    teams: document.getElementById("teamsScreen"),
    teamSetup: document.getElementById("teamSetupScreen"),
    teamDetails: document.getElementById("teamDetailsScreen"),
    newGame: document.getElementById("newGameScreen"),
gameConfirmation: document.getElementById("gameConfirmationScreen"),
liveGame: document.getElementById("liveGameScreen"),    
gameSummary: document.getElementById("gameSummaryScreen"),
games: document.getElementById("gamesScreen"),
    reports: document.getElementById("reportsScreen"),
    settings: document.getElementById("settingsScreen")
};

const backButton = document.getElementById("backButton");
const homeButton = document.getElementById("homeButton");
const teamsList = document.getElementById("teamsList");
const rosterEditor = document.getElementById("rosterEditor");
function loadGames() {
    try {
        const saved = JSON.parse(
            localStorage.getItem(GAMES_STORAGE_KEY)
        );

        return Array.isArray(saved)
            ? saved
            : [];
    } catch (error) {
        console.error(
            "Court94 could not load games:",
            error
        );

        return [];
    }
}
// The saved games, or null when they can't be read (never an empty list in
// place of games that are there but unreadable).
function readSavedGamesIfReadable() {
    try {
        const text = localStorage.getItem(GAMES_STORAGE_KEY);

        if (text === null) {
            return [];
        }

        const saved = JSON.parse(text);

        return Array.isArray(saved) ? saved : null;
    } catch (error) {
        return null;
    }
}

function loadTeams() {
    try {
        const savedTeams = JSON.parse(localStorage.getItem(STORAGE_KEY));

        return Array.isArray(savedTeams)
            ? savedTeams
            : [];
    } catch (error) {
        console.error("Court94 could not load teams:", error);
        return [];
    }
}

// Writes to this device's storage, then reads it back. Returns true only when
// the browser kept exactly what was written: a full storage throws, and a
// write that didn't stick shows up on reading it back.
function writeStorageVerified(storageKey, text) {
    try {
        localStorage.setItem(storageKey, text);

        return localStorage.getItem(storageKey) === text;
    } catch (error) {
        console.error(`Court94 could not save ${storageKey}:`, error);
        return false;
    }
}

// Saves the team list and confirms it was saved. If saving fails, the
// previous saved copy is put back where possible and false is returned, so
// the caller can put the in-memory list back too and tell the coach.
function saveTeams() {
    let previousText = null;

    try {
        previousText = localStorage.getItem(STORAGE_KEY);
    } catch (error) {
        console.error("Court94 could not read the saved teams:", error);
    }

    if (writeStorageVerified(STORAGE_KEY, JSON.stringify(teams))) {
        return true;
    }

    try {
        if (localStorage.getItem(STORAGE_KEY) !== previousText) {
            if (previousText === null) {
                localStorage.removeItem(STORAGE_KEY);
            } else {
                localStorage.setItem(STORAGE_KEY, previousText);
            }
        }
    } catch (error) {
        console.error("Court94 could not put back the saved teams:", error);
    }

    return false;
}

const TEAM_SAVE_FAILED_MESSAGE =
    "This iPad's storage may be full. Go to Settings to check storage " +
    "and download a backup.";

// Game recovery copy: written after every stat so the game survives the app
// closing. A failed write never interrupts tracking; the header warning shows
// until a later write is confirmed, and the write is retried in the
// background (every new stat also retries it).
const RECOVERY_RETRY_DELAYS = [2000, 5000, 15000, 30000];

let recoveryRetryTimer = null;
let recoveryRetryCount = 0;
let recoveryWarningShown = false;

function setRecoveryWarning(show) {
    if (show === recoveryWarningShown) {
        return;
    }

    recoveryWarningShown = show;

    const warning = document.getElementById("recoveryWarning");

    if (warning) {
        warning.hidden = !show;
    }

    document.body.classList.toggle("recoveryWarningVisible", show);
}

function clearRecoveryRetry() {
    clearTimeout(recoveryRetryTimer);
    recoveryRetryTimer = null;
    recoveryRetryCount = 0;
}

function scheduleRecoveryRetry() {
    if (recoveryRetryTimer) {
        return;
    }

    const delay =
        RECOVERY_RETRY_DELAYS[
            Math.min(recoveryRetryCount, RECOVERY_RETRY_DELAYS.length - 1)
        ];

    recoveryRetryCount += 1;
    recoveryRetryTimer = setTimeout(() => {
        recoveryRetryTimer = null;
        saveLiveGameState();
    }, delay);
}

// What this page last saved as the game recovery (null: nothing yet, or no
// game in progress).
let lastSavedRecoveryText = null;

function getRecoveryText() {
    return JSON.stringify({
        liveGameState,
        liveActionHistory,
        selectedLivePlayerId,
        selectedTeamId,
        currentGameSetup
    });
}

// Two Court94 tabs or windows on one game: each page only saves over the game
// it last saved or opened. If another page changed it since, this page shows
// the newest version instead of overwriting it.
let gameChangedElsewhere = false;

function isSavedGameChangedElsewhere() {
    try {
        return (
            localStorage.getItem("court94LiveGameRecovery") !==
            lastSavedRecoveryText
        );
    } catch (error) {
        return false;
    }
}

function showNewestSavedGame() {
    if (gameChangedElsewhere) {
        return;
    }

    gameChangedElsewhere = true;
    clearRecoveryRetry();

    alert(
        "This game was changed in another Court94 tab or window.\n\n" +
        "Court94 will now show the newest version. Your last entry here " +
        "wasn't saved, so check the game and enter it again if needed."
    );

    location.reload();
}

function saveLiveGameState() {
    if (gameChangedElsewhere) {
        return false;
    }

    if (!liveGameState) {
        // Only clear the game this page knows: a game started in another
        // tab stays.
        if (!isSavedGameChangedElsewhere()) {
            try {
                localStorage.removeItem("court94LiveGameRecovery");
            } catch (error) {
                console.error("Court94 could not clear the game recovery:", error);
            }
        }

        lastSavedRecoveryText = null;
        clearRecoveryRetry();
        setRecoveryWarning(false);
        copyGameSaveIfLoaded();
        return true;
    }

    if (isSavedGameChangedElsewhere()) {
        showNewestSavedGame();
        return false;
    }

    const recoveryText = getRecoveryText();

    const saved = writeStorageVerified(
        "court94LiveGameRecovery",
        recoveryText
    );

    setRecoveryWarning(!saved);

    if (saved) {
        lastSavedRecoveryText = recoveryText;
        clearRecoveryRetry();
        copyGameSaveIfLoaded();
    } else {
        scheduleRecoveryRetry();
    }

    return saved;
}

function explainRecoveryWarning() {
    alert(
        "Game recovery not saved\n\n" +
        "Court94 couldn't save a recovery copy of this game on this iPad, " +
        "probably because its storage is full. Your stats are still being " +
        "tracked, and Court94 keeps trying to save the recovery copy.\n\n" +
        "While this warning shows, don't close Court94 or switch it off: if " +
        "it closes, recent stats could be lost.\n\n" +
        "When the game is over, tap Finish Game and Save Game as usual. " +
        "Afterwards, go to Settings to check storage and download a backup."
    );
}

// The game-save safety copy (safetycopy.js) loads after this file.
function copyGameSaveIfLoaded() {
    if (typeof copyGameSave === "function") {
        copyGameSave();
    }
}

window.addEventListener("pagehide", () => {
    // Saves the browser lost are being put back (safetycopy.js): saving the
    // older game from memory now would undo that.
    if (typeof safetyRestoring !== "undefined" && safetyRestoring) {
        return;
    }

    // No game here, nothing changed since this page last saved it, or another
    // tab changed the game since: saving now could only overwrite (or
    // remove) a newer game saved in another Court94 tab.
    if (
        !liveGameState ||
        getRecoveryText() === lastSavedRecoveryText ||
        isSavedGameChangedElsewhere()
    ) {
        return;
    }

    saveLiveGameState();
});

function showScreen(screenName) {
    console.log("SHOW SCREEN:", screenName);

    // Only used to reopen on the same screen; a full storage must never stop
    // the screen from changing.
    try {
        localStorage.setItem("court94CurrentScreen", screenName);
    } catch (error) {
        console.error("Court94 could not remember the current screen:", error);
    }

    Object.values(screens).forEach((screen) => {
        screen.classList.remove("activeScreen");
    });

    screens[screenName].classList.add("activeScreen");

    // Lets the landscape tracker layout apply only on the live game screen.
    document.body.classList.toggle(
        "liveTrackerActive",
        screenName === "liveGame"
    );
    fitLandscapeTracker();

    if (screenName === "home") {
    backButton.classList.add("hidden");
    homeButton.classList.add("hidden");
} else {
    backButton.classList.remove("hidden");
    homeButton.classList.remove("hidden");
}

    if (!["newGame", "gameConfirmation"].includes(screenName)) {
        replaceUnfinishedGameApproved = false;
    }

    updateUnfinishedGameBar(screenName);

    window.scrollTo({
        top: 0,
        behavior: "smooth"
    });
}

// ---------- Unfinished game ----------
// A game stays in progress until Save Game, even when the coach leaves the
// tracker or Court94 reopens elsewhere. The bar leads back to it from every
// other screen, and starting a new game never replaces it unasked.

// Set when the coach chose to delete the unfinished game for a new one.
let replaceUnfinishedGameApproved = false;

function isOnUnfinishedGame(screenName) {
    return (
        screenName === "liveGame" ||
        (screenName === "gameSummary" && !viewingSavedGame) ||
        (screenName === "gameConfirmation" && editingLiveGameSetup)
    );
}

function updateUnfinishedGameBar(screenName) {
    const bar = document.getElementById("unfinishedGameBar");

    if (!bar) {
        return;
    }

    const show = Boolean(liveGameState) && !isOnUnfinishedGame(screenName);

    bar.hidden = !show;

    if (show) {
        document.getElementById("unfinishedGameText").textContent =
            `Unfinished game vs ${liveGameState.opponent || "opponent"}` +
            (liveGameState.summaryOpen ? " (not saved yet)" : "");
    }
}

// Back to the unfinished game: its tracker, or its summary if it was
// finished but not saved. Always with the game's own team.
function continueUnfinishedGame() {
    if (!liveGameState) {
        return;
    }

    selectedTeamId = liveGameState.teamId || selectedTeamId;

    // The game's own setup (a new game's form may have been filled in and
    // abandoned meanwhile).
    currentGameSetup = {
        teamId: liveGameState.teamId,
        opponent: liveGameState.opponent,
        gameType: liveGameState.gameType,
        location: liveGameState.location,
        gameFormat: liveGameState.gameFormat,
        gameDate: liveGameState.gameDate
    };

    updateAppTeamBadge();
    renderLiveGame();

    if (liveGameState.summaryOpen) {
        openGameSummary();
    } else {
        showScreen("liveGame");
    }
}

// Starting a new game while one is unfinished: go back to it (first
// choice), keep it, or delete it for the new game. True only for delete.
function confirmReplaceUnfinishedGame() {
    const name = `vs ${liveGameState.opponent || "opponent"}`;

    if (
        confirm(
            `Unfinished game ${name}\n\n` +
            "This game hasn't been finished and saved yet.\n\n" +
            "Tap OK to go back to it.\n" +
            "Tap Cancel for other choices."
        )
    ) {
        continueUnfinishedGame();
        return false;
    }

    return confirm(
        `Delete the unfinished game ${name} and start a new game?\n\n` +
        "All of its stats will be permanently deleted. This can't be undone.\n\n" +
        "Tap Cancel to keep it."
    );
}

function createBlankPlayer() {
    return {
        id: crypto.randomUUID(),
        number: "",
        name: ""
    };
}

function createDefaultTeam() {
    return {
        id: crypto.randomUUID(),
        schoolName: "",
        teamName: "",
        season: "",
        roster: [
            createBlankPlayer(),
            createBlankPlayer(),
            createBlankPlayer(),
            createBlankPlayer(),
            createBlankPlayer()
        ],
        selectedTeamStats: [
            "offensiveRebounds",
            "defensiveRebounds",
            "forcedTurnovers",
            "transitionPoints",
            "opponentOffensiveRebounds"
        ],
        selectedPlayerStats: [
            "points",
            "assists",
            "steals",
            "blocks",
            "fouls"
        ]
    };
}

function renderStatChoices() {
    const teamStatChoices =
        document.getElementById("teamStatChoices");

    const playerStatChoices =
        document.getElementById("playerStatChoices");

    teamStatChoices.innerHTML = getTeamStatChoices()
        .map((stat) => {
            return `
                <label class="statChoice">
                    <input
                        type="checkbox"
                        data-team-stat="${stat.key}"
                    >

                    <span>
                        <strong>${stat.name}</strong>
                        <small>${stat.description}</small>
                    </span>
                </label>
            `;
        })
        .join("");

    playerStatChoices.innerHTML = playerStats
        .map((stat) => {
            return `
                <label class="statChoice">
                    <input
                        type="checkbox"
                        data-player-stat="${stat.key}"
                    >

                    <span>
                        <strong>${stat.name}</strong>
                        <small>${stat.description}</small>
                    </span>
                </label>
            `;
        })
        .join("");
}

function renderRosterEditor(roster) {
    rosterEditor.innerHTML = roster
        .map((player, index) => {
            return `
                <div class="rosterRow" data-player-row="${player.id}">
                    <input
                        type="text"
                        inputmode="numeric"
                        placeholder="#"
                        aria-label="Jersey number"
                        data-player-number
                        value="${player.number}"
                    >

                    <input
                        type="text"
                        placeholder="Player name"
                        aria-label="Player name"
                        data-player-name
                        value="${player.name}"
                    >
<label class="keepAtTopOption">
    <input
        type="checkbox"
        data-player-keep-at-top
        ${player.keepAtTop ? "checked" : ""}
    >
    <span>Starter</span>
</label>
                    <button
                        class="removePlayerButton"
                        type="button"
                        data-remove-player="${index}"
                    >
                        Delete Player
                    </button>
                </div>
            `;
        })
        .join("");

    document
        .querySelectorAll("[data-remove-player]")
        .forEach((button) => {
            button.addEventListener("click", () => {
                const row = button.closest(".rosterRow");

                if (rosterEditor.children.length === 1) {
                    alert("A team must have at least one roster row.");
                    return;
                }

                row.remove();
            });
        });
}

function openNewTeamForm() {
    editingTeamId = null;

    const newTeam = createDefaultTeam();

    document.getElementById("teamSetupTitle").textContent =
        "Create Team";

    document.getElementById("schoolNameInput").value = "";
    document.getElementById("teamNameInput").value = "";
    document.getElementById("seasonInput").value = "";

    renderRosterEditor(newTeam.roster);
    setSelectedStats(newTeam);

    showScreen("teamSetup");
}

function openEditTeamForm(teamId) {
    const team = teams.find(
        (savedTeam) => savedTeam.id === teamId
    );

    if (!team) {
        return;
    }

    editingTeamId = teamId;

    document.getElementById("teamSetupTitle").textContent =
        "Edit Team";

    document.getElementById("schoolNameInput").value =
        team.schoolName || "";

    document.getElementById("teamNameInput").value =
        team.teamName || "";

    document.getElementById("seasonInput").value =
        team.season || "";

    renderRosterEditor(team.roster);
    setSelectedStats(team);

    showScreen("teamSetup");
}

function setSelectedStats(team) {team.selectedTeamStats = [
    ...new Set(team.selectedTeamStats || [])
];

team.selectedPlayerStats = [
    ...new Set(team.selectedPlayerStats || [])
];
    document
        .querySelectorAll("[data-team-stat]")
        .forEach((checkbox) => {
            checkbox.checked =
                team.selectedTeamStats.includes(
                    checkbox.dataset.teamStat
                );
        });

    document
        .querySelectorAll("[data-player-stat]")
        .forEach((checkbox) => {
            checkbox.checked =
                team.selectedPlayerStats.includes(
                    checkbox.dataset.playerStat
                );
        });
}

function renderGameStatChoices(
    team,
    teamStatSelections = null,
    playerStatSelections = null
) {
    const gameTeamStatChoices =
        document.getElementById("gameTeamStatChoices");

    const gamePlayerStatChoices =
        document.getElementById("gamePlayerStatChoices");

    if (!gameTeamStatChoices || !gamePlayerStatChoices || !team) {
        return;
    }

    const selectedTeamStats = [
    ...new Set(
        teamStatSelections ??
        team.selectedTeamStats ??
        []
    )
];

const selectedPlayerStats = [
    ...new Set(
        playerStatSelections ??
        team.selectedPlayerStats ??
        []
    )
];
    gameTeamStatChoices.innerHTML = getTeamStatChoices()
        .map((stat) => {
            const isChecked =
                selectedTeamStats.includes(stat.key);

            return `
                <label class="gameStatChoice">
                    <input
                        type="checkbox"
                        data-game-team-stat="${stat.key}"
                        ${isChecked ? "checked" : ""}
                    >
                    <span>${stat.name}</span>
                </label>
            `;
        })
        .join("");

    gamePlayerStatChoices.innerHTML = playerStats
        .map((stat) => {
            const isChecked =
                selectedPlayerStats.includes(stat.key);

            return `
                <label class="gameStatChoice">
                    <input
                        type="checkbox"
                        data-game-player-stat="${stat.key}"
                        ${isChecked ? "checked" : ""}
                    >
                    <span>${stat.name}</span>
                </label>
            `;
        })
        .join("");
}

function collectRoster() {
    return [...document.querySelectorAll(".rosterRow")]
        .map((row) => {
            return {
    id: row.dataset.playerRow,
    number:
        row.querySelector("[data-player-number]").value.trim(),
    name:
        row.querySelector("[data-player-name]").value.trim(),
    keepAtTop:
    row.querySelector(
        "[data-player-keep-at-top]"
    )?.checked || false
};
        })
        .filter((player) => {
            return player.number || player.name;
        });
}

function collectSelectedStats(selector, dataName) {
    const selectedStats = [...document.querySelectorAll(selector)]
        .filter((checkbox) => checkbox.checked)
        .map((checkbox) => checkbox.dataset[dataName]);

    return [...new Set(selectedStats)];
}

function saveTeamFromForm(event) {
    event.preventDefault();

    const teamName =
        document
            .getElementById("teamNameInput")
            .value
            .trim();

    if (!teamName) {
        alert("Please enter a team name.");
        return;
    }

    const roster = collectRoster();

    if (roster.length === 0) {
        alert("Please add at least one player.");
        return;
    }

    const selectedTeamStats = collectSelectedStats(
        "[data-team-stat]",
        "teamStat"
    );

    const selectedPlayerStats = normalizePlayerStatSelection(
        collectSelectedStats(
            "[data-player-stat]",
            "playerStat"
        )
    );

    if (
        selectedTeamStats.length === 0 &&
        selectedPlayerStats.length === 0
    ) {
        alert("Please select at least one statistic.");
        return;
    }

    const teamData = {
        id:
            editingTeamId ||
            crypto.randomUUID(),

        schoolName:
            document
                .getElementById("schoolNameInput")
                .value
                .trim(),

        teamName,

        season:
            document
                .getElementById("seasonInput")
                .value
                .trim(),

        roster,
        selectedTeamStats,
        selectedPlayerStats
    };

    const previousTeams = teams;

    if (editingTeamId) {
        teams = teams.map((team) => {
            return team.id === editingTeamId
                ? teamData
                : team;
        });
    } else {
        teams = [...teams, teamData];
    }

    // Only a confirmed save leaves this screen. Otherwise nothing changes
    // and the coach's entries stay on the form.
    if (!saveTeams()) {
        teams = previousTeams;

        alert(
            "Court94 couldn't save this team, so nothing was changed. " +
            "Your entries are still on this screen.\n\n" +
            TEAM_SAVE_FAILED_MESSAGE
        );

        return;
    }

    renderTeams();
    showScreen("teams");
}function getSelectedTeam() {
    return teams.find(
        (team) => team.id === selectedTeamId
    );
}

function updateAppTeamBadge() {
    const badge =
        document.getElementById("appTeamBadge");

    if (!badge) {
        return;
    }

    const team = getSelectedTeam();

    if (!team) {
        badge.textContent = "YOUR TEAM";
        return;
    }

    const teamLabel = [
        team.schoolName,
        team.teamName
    ]
        .filter(Boolean)
        .join(" — ");

    badge.textContent =
        teamLabel || "YOUR TEAM";
}

function createEmptyStatObject(statKeys) {
    const statObject = {};

    statKeys.forEach((statKey) => {
        if (
            playerStatSettings.includes(statKey) ||
            isTeamStatSetting(statKey)
        ) {
            return;
        }

        if (
    statKey === "fieldGoals" ||
    statKey === "threePointers" ||
    statKey === "freeThrows"
) {
            statObject[statKey] = {
                made: 0,
                attempted: 0
            };
        } else {
            statObject[statKey] = 0;
        }
    });

    return statObject;
}

function saveLiveGameSetupChanges() {
    if (!liveGameState) {
        return;
    }

    const team = getSelectedTeam();

    if (!team) {
        return;
    }

    const gameStarters = Array.from(
        document.querySelectorAll(
            ".gameStarterCheckbox:checked"
        )
    ).map((checkbox) => checkbox.dataset.playerId);

    if (gameStarters.length !== 5) {
        alert("Please select exactly 5 starters.");
        return;
    }

    const selectedGameTeamStats = Array.from(
        document.querySelectorAll(
            "[data-game-team-stat]:checked"
        )
    ).map(
        (checkbox) => checkbox.dataset.gameTeamStat
    );

    const selectedGamePlayerStats = normalizePlayerStatSelection(
        Array.from(
            document.querySelectorAll(
                "[data-game-player-stat]:checked"
            )
        ).map(
            (checkbox) => checkbox.dataset.gamePlayerStat
        )
    );

    // Records the settings in place before this change (older games).
    ensureScoringTracking();

    liveGameState.gameStarters = gameStarters;

    // Must be worked out before the new player stats replace the old ones.
    liveGameState.shootingCoverage =
        getNextShootingCoverage(
            liveGameState,
            selectedGamePlayerStats
        );

    liveGameState.selectedTeamStats =
        selectedGameTeamStats;
    liveGameState.selectedPlayerStats =
        selectedGamePlayerStats;

    // Opponent Scoring or Points turned on or off: plus/minus only uses
    // baskets from when both were tracked.
    noteScoringTrackingChange();

    selectedGameTeamStats.forEach((statKey) => {
        if (
            liveGameState.teamStats[statKey] ===
            undefined
        ) {
            liveGameState.teamStats[statKey] =
                createEmptyStatObject([statKey])[statKey];
        }
    });

    Object.values(
        liveGameState.teamStatsByPeriod || {}
    ).forEach((periodStats) => {
        selectedGameTeamStats.forEach((statKey) => {
            if (periodStats[statKey] === undefined) {
                periodStats[statKey] =
                    createEmptyStatObject(
                        [statKey]
                    )[statKey];
            }
        });
    });

    team.roster.forEach((player) => {
        if (!liveGameState.playerStatsById[player.id]) {
            liveGameState.playerStatsById[player.id] = {
                points: 0
            };
        }

        selectedGamePlayerStats.forEach((statKey) => {
            if (
                liveGameState.playerStatsById[player.id][
                    statKey
                ] === undefined
            ) {
                liveGameState.playerStatsById[player.id][
                    statKey
                ] = 0;
            }
        });
    });

    Object.values(
        liveGameState.playerStatsByPeriod || {}
    ).forEach((periodPlayers) => {
        team.roster.forEach((player) => {
            if (!periodPlayers[player.id]) {
                periodPlayers[player.id] = {
                    points: 0
                };
            }

            selectedGamePlayerStats.forEach(
                (statKey) => {
                    if (
                        periodPlayers[player.id][
                            statKey
                        ] === undefined
                    ) {
                        periodPlayers[player.id][
                            statKey
                        ] = 0;
                    }
                }
            );
        });
    });

    editingLiveGameSetup = false;

    renderLiveGame();
    saveLiveGameState();
    showScreen("liveGame");
}

function startLiveGame() {
    const team = getSelectedTeam();

    if (!team || !currentGameSetup) {
        return;
    }

    // Last check before the new game replaces an unfinished one.
    if (liveGameState && !replaceUnfinishedGameApproved) {
        if (!confirmReplaceUnfinishedGame()) {
            return;
        }
    }

    replaceUnfinishedGameApproved = false;

    const gameStarters = Array.from(
    document.querySelectorAll(
        ".gameStarterCheckbox:checked"
    )
).map((checkbox) => checkbox.dataset.playerId);

if (gameStarters.length !== 5) {
    alert("Please select exactly 5 starters.");
    return;
}

    selectedLivePlayerId =
        team.roster.length > 0
            ? team.roster[0].id
            : null;

    liveActionHistory = [];

    // Unfinished SUB OUT / SUB IN taps belong to the previous game.
    pendingSubOutPlayerIds = [];
    pendingSubInPlayerIds = [];

    const selectedGameTeamStats = Array.from(
    document.querySelectorAll(
        "[data-game-team-stat]:checked"
    )
).map(
    (checkbox) => checkbox.dataset.gameTeamStat
);

const selectedGamePlayerStats = normalizePlayerStatSelection(
    Array.from(
        document.querySelectorAll(
            "[data-game-player-stat]:checked"
        )
    ).map(
        (checkbox) => checkbox.dataset.gamePlayerStat
    )
);

    const playerStatsById = {};

    team.roster.forEach((player) => {
        playerStatsById[player.id] =
            createEmptyStatObject(
                selectedGamePlayerStats
            );

        playerStatsById[player.id].points = 0;
    });

    liveGameState = {
        ...currentGameSetup,

        gameStarters,
currentFive: [...gameStarters],
playerDisplayOrder: [
    ...gameStarters,
    ...team.roster
        .filter((player) => !gameStarters.includes(player.id))
        .map((player) => player.id)
],

        selectedTeamStats: selectedGameTeamStats,
selectedPlayerStats: selectedGamePlayerStats,

        shootingCoverage:
            hasIndividualShooting(selectedGamePlayerStats)
                ? "full"
                : "none",

        // Players who came in as substitutes (starters are in gameStarters).
        subbedInPlayerIds: [],
        participationTracked: true,

        teamStats:
            createEmptyStatObject(
                selectedGameTeamStats
            ),

        playerStatsById,
        
        teamStatsByPeriod: {},
playerStatsByPeriod: {},

       period:
    currentGameSetup.gameFormat === "Halves"
        ? "1st Half"
        : "Q1"
    };

    liveGameState.teamStatsByPeriod[
    liveGameState.period
] = createEmptyStatObject(
    selectedGameTeamStats
);

liveGameState.playerStatsByPeriod[
    liveGameState.period
] = {};

team.roster.forEach((player) => {
    liveGameState.playerStatsByPeriod[
        liveGameState.period
    ][player.id] = createEmptyStatObject(
        selectedGamePlayerStats
    );

    liveGameState.playerStatsByPeriod[
        liveGameState.period
    ][player.id].points = 0;
});

    // Which teams' scoring is tracked from the start (for plus/minus), and
    // the starting five in the lineup log when Opponent Scoring is on.
    liveGameState.scoringTracking = [getScoringTrackingState()];
    addScoringLogEvent("lineup");

    renderLiveGame();

    // Every new game opens on TRACK, and the (hidden) Summary is rebuilt for
    // this game so nothing from the previous game can show.
    showTrackTab();
    renderLiveSummary();

    // Save right away so the new game (and its coverage) survives a refresh
    // even before the first stat is recorded.
    saveLiveGameState();

    showScreen("liveGame");
}

// Shows the TRACK tab (player and team buttons) on the live game screen.
function showTrackTab() {
    document
        .getElementById("playersTabButton")
        .classList.add("activeTrackerTab");

    document
        .getElementById("summaryTabButton")
        .classList.remove("activeTrackerTab");

    document
        .getElementById("playerTrackerPanel")
        .classList.add("activeTrackerPanel");

    document
        .getElementById("summaryTrackerPanel")
        .classList.remove("activeTrackerPanel");

    fitLandscapeTracker();
}

function renderLiveGame() {
    const team = getSelectedTeam();

    if (!team || !liveGameState) {
        return;
    }

    document.getElementById(
        "liveGameMatchup"
    ).textContent =
        `${team.teamName} vs ${liveGameState.opponent}`;

    document.getElementById(
        "liveGameDetails"
    ).textContent =
        `${liveGameState.gameType} · ${liveGameState.location}`;

    const periodSelect =
    document.getElementById("livePeriodSelect");

if (liveGameState.gameFormat === "Halves") {
    periodSelect.innerHTML = `
        <option value="1st Half">1st Half</option>
        <option value="2nd Half">2nd Half</option>
        <option value="OT">OT</option>
    `;
} else {
    periodSelect.innerHTML = `
        <option value="Q1">Q1</option>
        <option value="Q2">Q2</option>
        <option value="Q3">Q3</option>
        <option value="Q4">Q4</option>
        <option value="OT">OT</option>
    `;
}

periodSelect.value = liveGameState.period;

    renderPlayerBench();
    connectPlayerCardButtons();
    renderPlayerStatButtons();
    renderTeamStatButtons();
    updateLiveTeamPointTotal();
    renderLastAction();

    ensureScoringTracking();
    renderOpponentScoring();
}

// Alphabetical by first name (the name as entered, first word first).
// Unnamed players go last; ties go by jersey number.
function comparePlayersByFirstName(playerA, playerB) {
    const nameA = (playerA.name || "").trim();
    const nameB = (playerB.name || "").trim();

    if (!nameA || !nameB) {
        if (nameA || nameB) {
            return nameA ? -1 : 1;
        }
    }

    return (
        nameA.localeCompare(nameB, undefined, { sensitivity: "base" }) ||
        String(playerA.number || "").localeCompare(
            String(playerB.number || ""),
            undefined,
            { numeric: true }
        ) ||
        String(playerA.id).localeCompare(String(playerB.id))
    );
}

// LANDSCAPE TRACKER (iPad landscape only — portrait is unchanged)
// Short labels for the narrower landscape stat buttons.
const landscapeStatLabels = {
    assists: "AST",
    steals: "STL",
    blocks: "BLK",
    fouls: "FOUL",
    offensiveRebounds: "OREB",
    defensiveRebounds: "DREB",
    turnovers: "TO"
};

// Team stat names too long for the landscape team strip.
const landscapeTeamStatLabels = {
    offensiveRebounds: "Off Rebounds",
    defensiveRebounds: "Def Rebounds",
    forcedTurnovers: "Forced TO"
};

let landscapeFit = null;

function isLandscapeTracker() {
    return (
        document.body.classList.contains("liveTrackerActive") &&
        window.matchMedia(
            "(orientation: landscape) and (min-width: 1024px)"
        ).matches
    );
}

// Display only. Uses two button columns (wider buttons) when the five
// on-court cards still fit on screen, otherwise three. Any height left
// over makes the buttons taller, as long as the bench stays on screen too.
function fitLandscapeTracker() {
    const bench = document.getElementById("playerBench");

    if (!bench) {
        return;
    }

    if (!isLandscapeTracker()) {
        bench.classList.remove("landscapeTwoColumns");
        bench.style.removeProperty("--landscape-button-height");
        landscapeFit = null;
        return;
    }

    const cards = [...bench.querySelectorAll(".playerCard")];
    const onCourtCards = cards.slice(0, 5);

    // Nothing to measure while the cards are hidden (e.g. SUMMARY tab).
    if (onCourtCards.length === 0 || !onCourtCards[0].offsetParent) {
        return;
    }

    const statButtonCount =
        onCourtCards[0].querySelectorAll(".playerCardStats > button").length;

    const pointButtonCount =
        onCourtCards[0].querySelectorAll(".playerCardPointButton").length;

    const setup = [
        statButtonCount,
        pointButtonCount,
        document.querySelectorAll("#teamStatButtons button").length,
        cards.length
    ].join("|");

    // Re-measure only when the stats, roster or screen size change — not on
    // every tap, and not for small changes in Safari's toolbar height.
    if (
        landscapeFit &&
        landscapeFit.setup === setup &&
        landscapeFit.width === window.innerWidth &&
        Math.abs(landscapeFit.height - window.innerHeight) < 120
    ) {
        return;
    }

    landscapeFit = {
        setup,
        width: window.innerWidth,
        height: window.innerHeight
    };

    const bottomOf = (elements) =>
        Math.max(
            ...elements.map(
                (element) =>
                    element.getBoundingClientRect().bottom + window.scrollY
            )
        );

    const available = window.innerHeight - 8;

    bench.style.setProperty("--landscape-button-height", "44px");
    // Two wider columns (full labels) when the five fit with a spare row of
    // buttons (44px + 6px gap). The miss buttons' own row already saves that
    // row, so screens choose the same columns as before and the bench never
    // ends up lower; the saved height goes to taller buttons instead.
    bench.classList.add("landscapeTwoColumns");

    if (bottomOf(onCourtCards) > available - 50) {
        bench.classList.remove("landscapeTwoColumns");
    }

    const columns =
        bench.classList.contains("landscapeTwoColumns") ? 2 : 3;

    // Rows of buttons in a card: points, the miss row (always three across,
    // under +1/+2/+3), then the other stats and the row Undo ends.
    const missButtonCount =
        onCourtCards[0].querySelectorAll(".playerCardStats > .playerCardMissButton").length;

    const buttonRows =
        (pointButtonCount > 0 ? 1 : 0) +
        (missButtonCount > 0 ? 1 : 0) +
        Math.floor((statButtonCount - missButtonCount - 1) / columns) + 1;

    const spare = available - bottomOf(cards);

    if (spare > 0) {
        const buttonHeight =
            Math.min(64, 44 + Math.floor(spare / buttonRows));

        bench.style.setProperty(
            "--landscape-button-height",
            `${buttonHeight}px`
        );
    }
}

window.addEventListener("resize", () => {
    fitLandscapeTracker();
});

function renderPlayerBench() {
    connectPlayerCardButtons();
    const team = getSelectedTeam();

    const playerBench =
        document.getElementById("playerBench");

    const uniquePlayerStats = [
    ...new Set(
        liveGameState?.selectedPlayerStats ||
        team.selectedPlayerStats ||
        []
    )
];
const currentFive =
    liveGameState?.currentFive || [];

if (!liveGameState.playerDisplayOrder) {
    liveGameState.playerDisplayOrder = [
        ...currentFive,
        ...team.roster
            .filter(
                (player) =>
                    !currentFive.includes(player.id)
            )
            .map((player) => player.id)
    ];
}

// SUB IN looks players up here, so it must include everyone on the roster
// (e.g. a player added to the team during the game).
team.roster.forEach((player) => {
    if (!liveGameState.playerDisplayOrder.includes(player.id)) {
        liveGameState.playerDisplayOrder.push(player.id);
    }
});

// Cards show the five on the court, then the bench, each alphabetical by
// first name. Display only: player IDs, stats, substitutions and plus/minus
// don't depend on card order. A completed substitution changes currentFive,
// so both groups re-sort; a pending SUB OUT or SUB IN doesn't move anyone.
const onCourtPlayers =
    team.roster
        .filter((player) => currentFive.includes(player.id))
        .sort(comparePlayersByFirstName);

const benchPlayers =
    team.roster
        .filter((player) => !currentFive.includes(player.id))
        .sort(comparePlayersByFirstName);

const sortedRoster = [...onCourtPlayers, ...benchPlayers];
    playerBench.innerHTML = sortedRoster
        .map((player, index) => {
            const points =
                getPlayerStatTotal(
                    player.id,
                    "points"
                );

            // Card stats are alphabetical by full name (Assists, Blocks,
            // Defensive Rebounds, Fouls, Offensive Rebounds, Steals,
            // Turnovers). +1/+2/+3 and the miss buttons stay above them and
            // Undo stays last.
            const cardStats =
                playerStats
                    .filter(
                        (stat) =>
                            isPlayerCounterStat(stat.key) &&
                            uniquePlayerStats.includes(stat.key)
                    )
                    .sort((statA, statB) =>
                        statA.name.localeCompare(statB.name, undefined, {
                            sensitivity: "base"
                        })
                    );

            // Gray miss buttons show each player's misses for that shot type.
            const missButtons =
                hasIndividualShooting(uniquePlayerStats)
                    ? ["ft", "two", "three"]
                          .map((shotType) => {
                              return `
                            <button
    class="playerCardStatButton playerCardMissButton"
    type="button"
    data-card-player-miss="${shotType}"
    data-card-player-id="${player.id}"
>
    <span>${shotTypes[shotType].label} Miss</span>

    <strong>${getPlayerMissTotal(player.id, shotType)}</strong>
</button>
                        `;
                          })
                          .join("")
                    : "";

            const cardButtonCount =
                (missButtons ? 3 : 0) + cardStats.length;

            // Undo fills the rest of the last row.
            const undoSpan =
                3 - (cardButtonCount % 3);

            // Same rule for the two-column landscape cards, where the miss
            // buttons have their own row under +1/+2/+3.
            const undoSpanTwo =
                2 - (cardStats.length % 2);

            const statButtons =
                cardStats
                    .map((stat) => {
                        const statKey = stat.key;

                        return `
                            <button
    class="playerCardStatButton"
    type="button"
    data-card-player-stat="${statKey}"
    data-card-player-id="${player.id}"
>
    <span data-short-label="${landscapeStatLabels[statKey] || ""}">${stat.shortName || stat.name}</span>

    <strong>
        ${getPlayerStatTotal(
            player.id,
            statKey
        )}
    </strong>
</button>
                        `;
                    })
                    .join("");

            return `
                <article
                    class="playerCard"
                    data-player-card="${player.id}"
                >

                    <div class="playerCardHeader">

                        <div>
                            <span class="playerCardNumber">
                                #${player.number || "—"}
                            </span>

                            <strong class="playerCardName">
                                ${player.name || "Unnamed"}
                            </strong>
                        </div>

                        <button
    class="playerSubButton"
    type="button"
    data-sub-player-id="${player.id}"
    data-sub-action="${
        currentFive.includes(player.id) ? "out" : "in"
    }"
>
    ${
        currentFive.includes(player.id)
            ? "SUB OUT"
            : "SUB IN"
    }
</button>
                        <div class="playerCardPoints">
                            <strong>${points}</strong>
                            <span>PTS</span>
                        </div>

                    </div>

                    ${
                        uniquePlayerStats.includes("points")
                            ? `
                                <div class="playerCardScoring">

                                    <button
                                        class="playerCardPointButton"
                                        type="button"
                                        data-card-player-points="1"
                                        data-card-player-id="${player.id}"
                                    >
                                        +1
                                    </button>

                                    <button
                                        class="playerCardPointButton"
                                        type="button"
                                        data-card-player-points="2"
                                        data-card-player-id="${player.id}"
                                    >
                                        +2
                                    </button>

                                    <button
                                        class="playerCardPointButton"
                                        type="button"
                                        data-card-player-points="3"
                                        data-card-player-id="${player.id}"
                                    >
                                        +3
                                    </button>

                                </div>
                            `
                            : ""
                    }

                    <div class="playerCardStats">
                        ${missButtons}
                        ${statButtons}

                        <button
                            class="playerCardUndoButton undoSpan${undoSpan} undoSpanTwo${undoSpanTwo}"
                            type="button"
                            data-card-player-undo="${player.id}"
                        >
                            ↶ Undo
                        </button>
                    </div>

             </article>

${index === onCourtPlayers.length - 1 ? `<div class="benchDivider">BENCH</div>` : ""}
`;
        })
        .join("");

    fitLandscapeTracker();
}

function updateLiveTeamPointTotal() {
    const totalElement =
        document.getElementById("liveTeamPointTotal");

    if (!totalElement || !liveGameState) {
        return;
    }

    // Player points plus points from unknown shooters (TEAM +1/+2/+3).
    const totalPoints =
        Object.values(
            liveGameState.playerStatsById || {}
        ).reduce(
            (sum, playerStats) =>
                sum + (playerStats.points || 0),
            0
        ) + getUnknownShooterPoints();

    totalElement.textContent = totalPoints;
}
function connectPlayerCardButtons() {
    document
        .querySelectorAll("[data-card-player-points]")
        .forEach((button) => {
            button.addEventListener("click", () => {
                selectedLivePlayerId =
                    button.dataset.cardPlayerId;

                recordPlayerPoints(
                    Number(
                        button.dataset.cardPlayerPoints
                    )
                );

                renderPlayerBench();
                connectPlayerCardButtons();
            });
        });

    document
        .querySelectorAll("[data-card-player-stat]")
        .forEach((button) => {
            button.addEventListener("click", () => {
                selectedLivePlayerId =
                    button.dataset.cardPlayerId;

                recordPlayerStat(
                    button.dataset.cardPlayerStat
                );

                renderPlayerBench();
                connectPlayerCardButtons();
            });
        });

    document
        .querySelectorAll("[data-card-player-miss]")
        .forEach((button) => {
            button.addEventListener("click", () => {
                selectedLivePlayerId =
                    button.dataset.cardPlayerId;

                recordPlayerMiss(
                    button.dataset.cardPlayerMiss
                );

                renderPlayerBench();
                connectPlayerCardButtons();
            });
        });
        document
    .querySelectorAll("[data-card-player-undo]")
    .forEach((button) => {
        button.addEventListener("click", () => {
            undoLastPlayerAction(
                button.dataset.cardPlayerUndo
            );
        });
    });
    document
    .querySelectorAll(".playerSubButton")
    .forEach((button) => {
        const playerId = String(button.dataset.subPlayerId);
        const action = button.dataset.subAction;

        if (
            (action === "out" &&
                pendingSubOutPlayerIds.includes(playerId)) ||
            (action === "in" &&
                pendingSubInPlayerIds.includes(playerId))
        ) {
            button.classList.add("pendingSubButton");
        }

        button.addEventListener("click", () => {
            if (action === "out") {
                if (pendingSubOutPlayerIds.includes(playerId)) {
                    pendingSubOutPlayerIds =
                        pendingSubOutPlayerIds.filter(
                            (id) => id !== playerId
                        );
                } else {
                    pendingSubOutPlayerIds.push(playerId);
                }
            }

            if (action === "in") {
                if (pendingSubInPlayerIds.includes(playerId)) {
                    pendingSubInPlayerIds =
                        pendingSubInPlayerIds.filter(
                            (id) => id !== playerId
                        );
                } else {
                    pendingSubInPlayerIds.push(playerId);
                }
            }

            let lineupChanged = false;

            while (
                pendingSubOutPlayerIds.length > 0 &&
                pendingSubInPlayerIds.length > 0
            ) {
                const outPlayerId =
                    pendingSubOutPlayerIds.shift();

                const inPlayerId =
                    pendingSubInPlayerIds.shift();

                const currentFiveIndex =
                    liveGameState.currentFive.findIndex(
                        (id) =>
                            String(id) === String(outPlayerId)
                    );

                if (currentFiveIndex !== -1) {
                    const incomingDisplayId =
                        liveGameState.playerDisplayOrder.find(
                            (id) =>
                                String(id) === String(inPlayerId)
                        );

                    if (incomingDisplayId !== undefined) {
                        liveGameState.currentFive[
                            currentFiveIndex
                        ] = incomingDisplayId;

                        // A completed substitution: this player played.
                        recordSubstitutionIn(incomingDisplayId);
                        lineupChanged = true;
                    }
                }

                const outDisplayIndex =
                    liveGameState.playerDisplayOrder.findIndex(
                        (id) =>
                            String(id) === String(outPlayerId)
                    );

                const inDisplayIndex =
                    liveGameState.playerDisplayOrder.findIndex(
                        (id) =>
                            String(id) === String(inPlayerId)
                    );

                if (
                    outDisplayIndex !== -1 &&
                    inDisplayIndex !== -1
                ) {
                    [
                        liveGameState.playerDisplayOrder[
                            outDisplayIndex
                        ],
                        liveGameState.playerDisplayOrder[
                            inDisplayIndex
                        ]
                    ] = [
                        liveGameState.playerDisplayOrder[
                            inDisplayIndex
                        ],
                        liveGameState.playerDisplayOrder[
                            outDisplayIndex
                        ]
                    ];
                }
            }

            // The new five in the lineup log (one entry per tap, so a queued
            // double substitution records only the final lineup).
            if (lineupChanged) {
                addScoringLogEvent("lineup");
            }

            renderPlayerBench();
            connectPlayerCardButtons();
            saveLiveGameState();
        });
    });
}
function getPlayerStatTotal(playerId, statKey) {
    const playerStats =
        liveGameState.playerStatsById[playerId];

    if (!playerStats) {
        return 0;
    }

    return playerStats[statKey] || 0;
}

function formatShootingStat(statValue) {
    if (
        !statValue ||
        typeof statValue !== "object"
    ) {
        return "0 / 0 · 0%";
    }

    const made =
        Number(statValue.made) || 0;

    const attempted =
        Number(statValue.attempted) || 0;

    const percentage =
        attempted > 0
            ? Math.round(
                (made / attempted) * 100
            )
            : 0;

    return `
    <div class="shootingStatValue">
        <div>${made} / ${attempted}</div>
        <div>${percentage}%</div>
    </div>
`;
}

function getTeamStatTotal(statKey) {
    const statValue =
        liveGameState.teamStats[statKey];

    if (
    statKey === "fieldGoals" ||
    statKey === "threePointers" ||
    statKey === "freeThrows"
) {
        return formatShootingStat(statValue);
    }

    return statValue || 0;
}

function renderPlayerStatButtons() {
    const team = getSelectedTeam();

    const selectedPlayer =
        team.roster.find(
            (player) =>
                player.id === selectedLivePlayerId
        );

    const selectedPlayerName =
        document.getElementById(
            "selectedPlayerName"
        );

    const container =
        document.getElementById(
            "playerStatButtons"
        );

    if (!selectedPlayer) {
        selectedPlayerName.textContent =
            "Select a player";

        container.innerHTML = "";
        return;
    }

    selectedPlayerName.textContent =
        `#${selectedPlayer.number || "—"} ${selectedPlayer.name}`;

    const uniquePlayerStats =
        [...new Set(team.selectedPlayerStats)];

    let buttonHtml = "";

    if (
        uniquePlayerStats.includes("points")
    ) {
        const totalPoints =
            getPlayerStatTotal(
                selectedPlayer.id,
                "points"
            );

        buttonHtml += `
            <div class="playerPointsCard">

                <div class="playerPointsHeading">
                    <span>POINTS</span>
                    <strong>${totalPoints}</strong>
                </div>

                <div class="playerPointsButtons">

                    <button
                        class="pointsAddButton"
                        type="button"
                        data-player-points="1"
                    >
                        +1
                    </button>

                    <button
                        class="pointsAddButton"
                        type="button"
                        data-player-points="2"
                    >
                        +2
                    </button>

                    <button
                        class="pointsAddButton"
                        type="button"
                        data-player-points="3"
                    >
                        +3
                    </button>

                </div>

            </div>
        `;
    }

    uniquePlayerStats
        .filter((statKey) => isPlayerCounterStat(statKey))
        .forEach((statKey) => {
            const stat = playerStats.find(
                (item) => item.key === statKey
            );

            if (!stat) {
                return;
            }

            buttonHtml += `
                <button
                    class="liveStatButton"
                    type="button"
                    data-player-stat="${statKey}"
                >
                    <span class="liveStatButtonName">
                        ${stat.name}
                    </span>

                    <span class="liveStatButtonTotal">
                        ${getPlayerStatTotal(
                            selectedPlayer.id,
                            statKey
                        )}
                    </span>
                </button>
            `;
        });

    container.innerHTML = buttonHtml;

    document
        .querySelectorAll("[data-player-points]")
        .forEach((button) => {
            button.addEventListener("click", () => {
                recordPlayerPoints(
                    Number(button.dataset.playerPoints)
                );
            });
        });

    document
        .querySelectorAll("[data-player-stat]")
        .forEach((button) => {
            button.addEventListener("click", () => {
                recordPlayerStat(
                    button.dataset.playerStat
                );
            });
        });
}
function renderTeamStatButtons() {
    const team = getSelectedTeam();

    const container =
        document.getElementById("teamStatButtons");

    const uniqueTeamStats = [
    ...new Set(
        liveGameState.selectedTeamStats ||
        team.selectedTeamStats ||
        []
    )
];

    // Single-count cards alphabetical by name. The shooting cards (FG, 3PT,
    // FT) follow as a group, and Transition is always last.
    const regularStats =
    uniqueTeamStats.filter(
        (statKey) =>
            statKey !== "transitionPoints" &&
            statKey !== "fieldGoals" &&
            statKey !== "threePointers" &&
            statKey !== "freeThrows"
    ).sort((keyA, keyB) =>
        getStatName(teamStats, keyA).localeCompare(
            getStatName(teamStats, keyB),
            undefined,
            { sensitivity: "base" }
        )
    );

const hasFieldGoals =
    uniqueTeamStats.includes("fieldGoals");

    const hasThreePointers =
    uniqueTeamStats.includes("threePointers");

const hasFreeThrows =
    uniqueTeamStats.includes("freeThrows");

    const hasTransition =
        uniqueTeamStats.includes("transitionPoints");

    const cardColors = [
    "teamStatBlue"
];

    const regularCards = regularStats
        .map((statKey, index) => {
            const stat = teamStats.find(
                (item) => item.key === statKey
            );

            if (!stat) {
                return "";
            }

            // Opponent stats are red, like the opponent scoring buttons.
            const colorClass =
                statKey === "opponentOffensiveRebounds"
                    ? "teamStatOpponent"
                    : cardColors[index % cardColors.length];

            return `
                <div
                    class="teamStatCard ${colorClass}"
                    data-team-stat-card="${statKey}"
                >
                    <div class="teamStatCardName"${
                        landscapeTeamStatLabels[statKey]
                            ? ` data-short-label="${landscapeTeamStatLabels[statKey]}"`
                            : ""
                    }>
                        ${stat.name}
                    </div>

                    <div class="teamStatCardTotal">
                        ${getTeamStatTotal(statKey)}
                    </div>

                    <div class="teamStatCardControls">

                        <button
                            type="button"
                            class="teamStatMinusButton"
                            data-team-stat-minus="${statKey}"
                        >
                            −1
                        </button>

                        <button
                            type="button"
                            class="teamStatPlusButton"
                            data-team-stat-plus="${statKey}"
                        >
                            +1
                        </button>

                    </div>
                </div>
            `;
        })
        .join("");

    const transitionCard = hasTransition
        ? `
            <div class="transitionPointsCard">

                <div class="transitionPointsHeader">
                    <span>Transition Points</span>

                    <strong>
                        ${getTeamStatTotal(
                            "transitionPoints"
                        )}
                    </strong>
                </div>

                <div class="transitionPointsButtons">

                    <button
                        type="button"
                        class="transitionUndoButton"
                        data-transition-undo
                    >
                        Undo
                    </button>

                    <button
                        type="button"
                        class="transitionAddButton"
                        data-transition-points="1"
                    >
                        +1
                    </button>

                    <button
                        type="button"
                        class="transitionAddButton"
                        data-transition-points="2"
                    >
                        +2
                    </button>

                    <button
                        type="button"
                        class="transitionAddButton"
                        data-transition-points="3"
                    >
                        +3
                    </button>

                </div>
            </div>
        `
        : "";

        const fieldGoalCard = hasFieldGoals
    ? (() => {
        const fieldGoals =
            liveGameState.teamStats.fieldGoals || {
                made: 0,
                attempted: 0
            };

        const made = fieldGoals.made || 0;
        const attempted = fieldGoals.attempted || 0;

        const percentage =
            attempted > 0
                ? Math.round((made / attempted) * 100)
                : 0;

        return `
            <div class="teamStatCard fieldGoalCard">
                <div class="teamStatCardName" data-short-label="FG">
                    FGM, FGA AND FG%
                </div>

                <div class="teamStatCardTotal">
                    ${made} / ${attempted}
<br>
${percentage}%
                </div>

                <div class="teamStatCardControls">
                    <button
                        type="button"
                        class="teamStatMinusButton"
                        data-field-goal-result="miss"
                    >
                        ${teamShotButtonLabel("miss", "fieldGoals")}
                    </button>

                    <button
    type="button"
    class="teamStatUndoButton"
    data-shooting-undo="fieldGoals"
>
    UNDO
</button>

                    <button
                        type="button"
                        class="teamStatPlusButton"
                        data-field-goal-result="make"
                    >
                        ${teamShotButtonLabel("make", "fieldGoals")}
                    </button>
                </div>
            </div>
        `;
    })()
    : "";

const threePointerCard = hasThreePointers
    ? (() => {
        const threePointers =
            liveGameState.teamStats.threePointers || {
                made: 0,
                attempted: 0
            };

        const made = threePointers.made || 0;
        const attempted = threePointers.attempted || 0;

        const percentage =
            attempted > 0
                ? Math.round((made / attempted) * 100)
                : 0;

        return `
            <div class="teamStatCard teamStatBlue threePointerCard">
                <div class="teamStatCardName" data-short-label="3PT">
                    3PM, 3PA AND 3P%
                </div>

                <div class="teamStatCardTotal">
                    ${made} / ${attempted}
                    <br>
                    ${percentage}%
                </div>

                <div class="teamStatCardControls">
                    <button
                        type="button"
                        class="teamStatMinusButton"
                        data-three-pointer-result="miss"
                    >
                        ${teamShotButtonLabel("miss", "threePointers")}
                    </button>

                    <button
                        type="button"
                        class="teamStatUndoButton"
                        data-shooting-undo="threePointers"
                    >
                        UNDO
                    </button>

                    <button
                        type="button"
                        class="teamStatPlusButton"
                        data-three-pointer-result="make"
                    >
                        ${teamShotButtonLabel("make", "threePointers")}
                    </button>
                </div>
            </div>
        `;
    })()
    : "";

    const freeThrowCard = hasFreeThrows
    ? (() => {
        const freeThrows =
            liveGameState.teamStats.freeThrows || {
                made: 0,
                attempted: 0
            };

        const made = freeThrows.made || 0;
        const attempted = freeThrows.attempted || 0;

        const percentage =
            attempted > 0
                ? Math.round((made / attempted) * 100)
                : 0;

        return `
            <div class="teamStatCard freeThrowCard">
                <div class="teamStatCardName" data-short-label="FT">
                    FTM, FTA AND FT%
                </div>

                <div class="teamStatCardTotal">
                    ${made} / ${attempted}
<br>
${percentage}%
                </div>

                <div class="teamStatCardControls">
                    <button
                        type="button"
                        class="teamStatMinusButton"
                        data-free-throw-result="miss"
                    >
                        ${teamShotButtonLabel("miss", "freeThrows")}
                    </button>

                    <button
    type="button"
    class="teamStatUndoButton"
    data-shooting-undo="freeThrows"
>
    UNDO
</button>

                    <button
                        type="button"
                        class="teamStatPlusButton"
                        data-free-throw-result="make"
                    >
                        ${teamShotButtonLabel("make", "freeThrows")}
                    </button>
                </div>
            </div>
        `;
    })()
    : "";

    const teamShotReminder =
        isTrackingPlayerPoints() &&
        (hasFieldGoals || hasThreePointers || hasFreeThrows)
            ? `<p class="teamShotReminder">TEAM shooting buttons are only for unknown shooters. Use the player's buttons when you know who shot.</p>`
            : "";

    container.innerHTML = `
        ${teamShotReminder}
        <div class="teamStatCardGrid">
    ${regularCards}
${fieldGoalCard}
${threePointerCard}
${freeThrowCard}
</div>

        ${transitionCard}
    `;

    // Lets the landscape team strip place the reminder above the tiles.
    container.classList.toggle(
        "hasTeamShotReminder",
        Boolean(teamShotReminder)
    );

    fitLandscapeTracker();

    document
        .querySelectorAll("[data-team-stat-plus]")
        .forEach((button) => {
            button.addEventListener("click", () => {
                recordTeamStat(
                    button.dataset.teamStatPlus
                );
            });
        });

        document
    .querySelectorAll("[data-team-stat-minus]")
    .forEach((button) => {
        button.addEventListener("click", () => {
            recordTeamStat(
                button.dataset.teamStatMinus,
                -1
            );
        });
    });

    document
    .querySelectorAll("[data-field-goal-result]")
    .forEach((button) => {
        button.addEventListener("click", () => {
            recordShootingResult(
                "fieldGoals",
                button.dataset.fieldGoalResult
            );
        });
    });

    document
    .querySelectorAll("[data-three-pointer-result]")
    .forEach((button) => {
        button.addEventListener("click", () => {
            recordShootingResult(
                "threePointers",
                button.dataset.threePointerResult
            );
        });
    });

    document
    .querySelectorAll("[data-free-throw-result]")
    .forEach((button) => {
        button.addEventListener("click", () => {
            recordShootingResult(
                "freeThrows",
                button.dataset.freeThrowResult
            );
        });
    });

    document
    .querySelectorAll("[data-shooting-undo]")
    .forEach((button) => {
        button.addEventListener("click", () => {
            undoShootingResult(
                button.dataset.shootingUndo
            );
        });
    });

    document
        .querySelectorAll("[data-transition-points]")
        .forEach((button) => {
            button.addEventListener("click", () => {
                recordTransitionPoints(
                    Number(
                        button.dataset.transitionPoints
                    )
                );
            });
        });

        document
    .querySelector("[data-transition-undo]")
    ?.addEventListener("click", () => {
        for (let i = liveActionHistory.length - 1; i >= 0; i--) {
            const action = liveActionHistory[i];

            if (action.type === "transitionPoints") {
                liveGameState.teamStats.transitionPoints =
                    Math.max(
                        0,
                        (liveGameState.teamStats.transitionPoints || 0) -
                            action.amount
                    );

                    const actionPeriod =
    action.period || liveGameState.period;

if (
    liveGameState.teamStatsByPeriod[
        actionPeriod
    ]
) {
    liveGameState.teamStatsByPeriod[
        actionPeriod
    ].transitionPoints =
        Math.max(
            0,
            (
                liveGameState.teamStatsByPeriod[
                    actionPeriod
                ].transitionPoints || 0
            ) - action.amount
        );
}

                liveActionHistory.splice(i, 1);
                renderTeamStatButtons();
                renderLastAction();
                // Saved straight away, like the other undos, so the undo
                // survives the app closing.
                saveLiveGameState();
                return;
            }
        }
    });
}
// Individual shooting. Each shot type lists the player counters it uses
// and the team shooting stats it also counts toward.
const shotTypes = {
    ft: {
        points: 1,
        label: "FT",
        madeKey: "ftMade",
        attemptedKey: "ftAttempted",
        teamStatKeys: ["freeThrows"]
    },
    two: {
        points: 2,
        label: "2PT",
        madeKey: "twoMade",
        attemptedKey: "twoAttempted",
        teamStatKeys: ["fieldGoals"]
    },
    three: {
        points: 3,
        label: "3PT",
        madeKey: "threeMade",
        attemptedKey: "threeAttempted",
        teamStatKeys: ["fieldGoals", "threePointers"]
    }
};

function getShotTypeForPoints(points) {
    return points === 1 ? "ft" : points === 2 ? "two" : "three";
}

function adjustCount(stats, statKey, change) {
    stats[statKey] = Math.max(0, (stats[statKey] || 0) + change);
}

function adjustShootingStat(stats, statKey, madeChange, attemptedChange) {
    if (!stats[statKey] || typeof stats[statKey] !== "object") {
        stats[statKey] = {
            made: 0,
            attempted: 0
        };
    }

    stats[statKey].made =
        Math.max(0, (stats[statKey].made || 0) + madeChange);

    stats[statKey].attempted =
        Math.max(0, (stats[statKey].attempted || 0) + attemptedChange);
}

// Records (direction 1) or reverses (direction -1) one player shot:
// the player's points and shooting counters, and the linked team totals,
// for the whole game and for the period the shot happened in.
// Team totals update even when a team card isn't shown, so a +3 always
// counts toward both team FG and team 3PT.
function applyPlayerShot(playerId, shotType, made, direction, period) {
    const shot = shotTypes[shotType];

    if (!shot) {
        return;
    }

    const madeChange = made ? direction : 0;
    const attemptedChange = direction;

    if (!liveGameState.playerStatsById[playerId]) {
        liveGameState.playerStatsById[playerId] = { points: 0 };
    }

    if (!liveGameState.playerStatsByPeriod[period]) {
        liveGameState.playerStatsByPeriod[period] = {};
    }

    if (!liveGameState.playerStatsByPeriod[period][playerId]) {
        liveGameState.playerStatsByPeriod[period][playerId] = { points: 0 };
    }

    [
        liveGameState.playerStatsById[playerId],
        liveGameState.playerStatsByPeriod[period][playerId]
    ].forEach((stats) => {
        if (made) {
            adjustCount(stats, "points", shot.points * direction);
        }

        adjustCount(stats, shot.madeKey, madeChange);
        adjustCount(stats, shot.attemptedKey, attemptedChange);
    });

    applyTeamShotTotals(shotType, madeChange, attemptedChange, period);
}

// The team shooting totals a shot counts toward, for the game and its period.
function applyTeamShotTotals(shotType, madeChange, attemptedChange, period) {
    const shot = shotTypes[shotType];

    if (!liveGameState.teamStatsByPeriod[period]) {
        liveGameState.teamStatsByPeriod[period] = {};
    }

    [
        liveGameState.teamStats,
        liveGameState.teamStatsByPeriod[period]
    ].forEach((stats) => {
        shot.teamStatKeys.forEach((statKey) => {
            adjustShootingStat(stats, statKey, madeChange, attemptedChange);
        });
    });
}

// ---------- Unknown shooters (team shooting cards when Points is tracked) ----------

// Which shot each team shooting card records for an unknown shooter.
// The FG card is always a two-point basket; 3-pointers use the 3PT card.
const teamShotTypeByStat = {
    freeThrows: "ft",
    fieldGoals: "two",
    threePointers: "three"
};

function isTrackingPlayerPoints() {
    const team = getSelectedTeam();

    return Boolean(
        liveGameState &&
        team &&
        getGameStatKeys(liveGameState, team, "selectedPlayerStats")
            .includes("points")
    );
}

function teamShotButtonLabel(result, statKey) {
    if (!isTrackingPlayerPoints()) {
        return result === "make" ? "MAKE" : "MISS";
    }

    const mainLabel =
        result === "make"
            ? `+${shotTypes[teamShotTypeByStat[statKey]].points}`
            : "MISS";

    // The space keeps "TEAM MISS" as two words for screen readers;
    // both parts are block-level, so it doesn't change the layout.
    return `<small class="teamShotTag">TEAM</small> <span>${mainLabel}</span>`;
}

function getUnknownShooterPoints() {
    return liveGameState?.unknownShooterStats?.points || 0;
}

// Records (direction 1) or reverses (direction -1) an unknown shooter's shot:
// the team totals, the unknown-shooter tally and, for a make, the score.
function applyUnknownShot(shotType, made, direction, period) {
    const shot = shotTypes[shotType];

    if (!shot) {
        return;
    }

    const madeChange = made ? direction : 0;

    if (!liveGameState.unknownShooterStats) {
        liveGameState.unknownShooterStats = {};
    }

    if (!liveGameState.unknownShooterStatsByPeriod) {
        liveGameState.unknownShooterStatsByPeriod = {};
    }

    if (!liveGameState.unknownShooterStatsByPeriod[period]) {
        liveGameState.unknownShooterStatsByPeriod[period] = {};
    }

    [
        liveGameState.unknownShooterStats,
        liveGameState.unknownShooterStatsByPeriod[period]
    ].forEach((stats) => {
        if (made) {
            adjustCount(stats, "points", shot.points * direction);
        }

        adjustCount(stats, shot.madeKey, madeChange);
        adjustCount(stats, shot.attemptedKey, direction);
    });

    applyTeamShotTotals(shotType, madeChange, direction, period);
}

function recordUnknownShot(statKey, result) {
    const shotType = teamShotTypeByStat[statKey];
    const shot = shotTypes[shotType];

    if (!shot) {
        return;
    }

    applyUnknownShot(
        shotType,
        result === "make",
        1,
        liveGameState.period
    );

    liveActionHistory.push({
        type: "unknownShot",
        statKey,
        shotType,
        result,
        period: liveGameState.period,
        scoringEventId:
            result === "make"
                ? addScoringLogEvent("for", shot.points)
                : null,
        description:
            result === "make"
                ? `Unknown shooter — TEAM +${shot.points}`
                : `Unknown shooter — TEAM ${shot.label} Miss`
    });

    renderTeamStatButtons();
    renderLastAction();
    updateLiveTeamPointTotal();

    saveLiveGameState();
}

// ---------- Shooting reports ----------

const shotKeys = [
    "ftMade",
    "ftAttempted",
    "twoMade",
    "twoAttempted",
    "threeMade",
    "threeAttempted"
];

// Report columns. FG combines 2PT and 3PT.
const shotReportColumns = [
    { label: "FT", madeKeys: ["ftMade"], attemptedKeys: ["ftAttempted"] },
    { label: "2PT", madeKeys: ["twoMade"], attemptedKeys: ["twoAttempted"] },
    { label: "3PT", madeKeys: ["threeMade"], attemptedKeys: ["threeAttempted"] },
    {
        label: "FG",
        madeKeys: ["twoMade", "threeMade"],
        attemptedKeys: ["twoAttempted", "threeAttempted"]
    }
];

function sumShotKeys(stats, keys) {
    return keys.reduce(
        (total, key) => total + (Number(stats?.[key]) || 0),
        0
    );
}

function addShotCounters(total, stats) {
    shotKeys.forEach((key) => {
        total[key] = (total[key] || 0) + (Number(stats?.[key]) || 0);
    });

    return total;
}

function hasShotAttempts(stats) {
    return sumShotKeys(stats, ["ftAttempted", "twoAttempted", "threeAttempted"]) > 0;
}

// A game's team FT / FG / 3PT totals, as FT / 2PT / 3PT counters.
function getTeamShotCounters(gameTeamStats) {
    const value = (stat, key) => Number(gameTeamStats?.[stat]?.[key]) || 0;

    return {
        ftMade: value("freeThrows", "made"),
        ftAttempted: value("freeThrows", "attempted"),
        threeMade: value("threePointers", "made"),
        threeAttempted: value("threePointers", "attempted"),
        twoMade: Math.max(
            0,
            value("fieldGoals", "made") - value("threePointers", "made")
        ),
        twoAttempted: Math.max(
            0,
            value("fieldGoals", "attempted") - value("threePointers", "attempted")
        )
    };
}

// Splits a game's team shooting into who it's credited to. The team totals
// are the source of truth; anything not credited to a player or entered with
// TEAM buttons (e.g. MAKE/MISS while Points was off, or shots from before
// player shooting was recorded) is "other team entries".
function getGameShootingBreakdown(game, team) {
    const rosterOrder = team.roster.map((player) => player.id);

    const playerIds = Object.keys(game.playerStatsById || {}).sort(
        (a, b) => {
            const indexA = rosterOrder.indexOf(a);
            const indexB = rosterOrder.indexOf(b);

            return (indexA === -1 ? 999 : indexA) - (indexB === -1 ? 999 : indexB);
        }
    );

    const players = playerIds
        .map((playerId) => {
            const player = team.roster.find((item) => item.id === playerId);

            return {
                label: player
                    ? `#${player.number || "—"} ${player.name || "Unnamed"}`
                    : "Former player",
                stats: game.playerStatsById[playerId]
            };
        })
        .filter((row) => hasShotAttempts(row.stats));

    const playerTotals = playerIds.reduce(
        (total, playerId) => addShotCounters(total, game.playerStatsById[playerId]),
        {}
    );

    const unknown = addShotCounters({}, game.unknownShooterStats);
    const teamTotals = getTeamShotCounters(game.teamStats);
    const other = {};

    shotKeys.forEach((key) => {
        other[key] = Math.max(
            0,
            teamTotals[key] - (playerTotals[key] || 0) - (unknown[key] || 0)
        );
    });

    return { players, unknown, other, teamTotals };
}

// "made/attempted", with the percentage underneath when it's meaningful.
function formatShotCell(stats, column, showPercentage) {
    const made = sumShotKeys(stats, column.madeKeys);
    const attempted = sumShotKeys(stats, column.attemptedKeys);
    const percentage =
        attempted > 0 ? `${Math.round((made / attempted) * 100)}%` : "—";

    return `
        <td>
            <div class="shotCell">
                <span>${made}/${attempted}</span>
                ${showPercentage ? `<small>${percentage}</small>` : ""}
            </div>
        </td>
    `;
}

function renderShotRow(label, stats, showPercentage, rowClass = "") {
    return `
        <tr class="${rowClass}">
            <td class="playerNameCell">${label}</td>
            ${shotReportColumns
                .map((column) => formatShotCell(stats, column, showPercentage))
                .join("")}
        </tr>
    `;
}

function renderShotTableHead(firstLabel) {
    return `
        <thead>
            <tr>
                <th>${firstLabel}</th>
                ${shotReportColumns.map((column) => `<th>${column.label}</th>`).join("")}
            </tr>
        </thead>
    `;
}

// The Player Shooting table for one game (live, end-of-game or saved).
function renderPlayerShootingSection(game, team) {
    const coverage = getShootingCoverage(game);

    // Shown whenever shooting was tracked at some point (even if Points was
    // later turned off); otherwise only a note, and only if Points was tracked.
    if (
        coverage === "none" &&
        !getGameStatKeys(game, team, "selectedPlayerStats").includes("points")
    ) {
        return "";
    }

    if (coverage === "none") {
        return `
            <div class="boxScoreWrap playerShootingSection">
                <h3>Player Shooting</h3>
                <p class="shootingCoverageNote">
                    Individual shooting wasn't tracked in this game, so player
                    attempts and percentages aren't available. Team shooting
                    totals are in Team Stats.
                </p>
            </div>
        `;
    }

    const isFull = coverage === "full";
    const { players, unknown, other, teamTotals } =
        getGameShootingBreakdown(game, team);

    return `
        <div class="boxScoreWrap playerShootingSection">
            <h3>
                Player Shooting
                <span class="coverageBadge ${isFull ? "coverageFull" : "coveragePartial"}">
                    ${isFull ? "Full game" : "Partial"}
                </span>
            </h3>

            ${
                isFull
                    ? ""
                    : `<p class="shootingCoverageNote">
                           Individual shooting was turned on or off during this game,
                           so player numbers only cover part of it. Player percentages
                           aren't shown; the team totals are complete.
                       </p>`
            }

            <table class="boxScoreTable shootingTable">
                ${renderShotTableHead("Player")}
                <tbody>
                    ${players.map((row) => renderShotRow(row.label, row.stats, isFull)).join("")}
                    ${
                        hasShotAttempts(unknown)
                            ? renderShotRow("Unknown shooter", unknown, isFull, "unknownShooterRow")
                            : ""
                    }
                    ${
                        hasShotAttempts(other)
                            ? renderShotRow("Other team entries", other, isFull, "unknownShooterRow")
                            : ""
                    }
                    ${renderShotRow("Team totals", teamTotals, true, "summaryTotalsRow")}
                </tbody>
            </table>
        </div>
    `;
}

// Unknown-shooter points as a Player Scoring row, so the table adds up to the score.
function renderUnknownScoringRow(game, periodColumns) {
    const totalPoints = game.unknownShooterStats?.points || 0;

    if (!totalPoints) {
        return "";
    }

    return `
        <tr class="unknownShooterRow">
            <td class="playerNameCell">Unknown shooter</td>
            ${periodColumns
                .map((period) => `<td>${getUnknownPeriodPoints(game, period)}</td>`)
                .join("")}
            <td>${totalPoints}</td>
        </tr>
    `;
}

function getUnknownPeriodPoints(game, period) {
    return game.unknownShooterStatsByPeriod?.[period]?.points || 0;
}

const coverageLabels = {
    full: "Full",
    partial: "Partial",
    none: "Not tracked"
};

// Season shooting: total made ÷ total attempted, from full-coverage games only.
function renderSeasonShootingSection(teamGames, team) {
    const counts = { full: 0, partial: 0, none: 0 };

    teamGames.forEach((game) => {
        counts[getShootingCoverage(game)] += 1;
    });

    if (counts.full === 0 && counts.partial === 0) {
        return "";
    }

    const excluded = [
        counts.partial ? `${counts.partial} partial` : "",
        counts.none ? `${counts.none} not tracked` : ""
    ]
        .filter(Boolean)
        .join(", ");

    const basis =
        `Based on ${counts.full} full-coverage game${counts.full === 1 ? "" : "s"} ` +
        `of ${teamGames.length}.${excluded ? ` Excluded: ${excluded}.` : ""}`;

    if (counts.full === 0) {
        return `
            <div class="reportPlayerStats seasonShootingSection">
                <h4>Player Shooting (Season)</h4>
                <p class="shootingCoverageNote">
                    No games with full individual shooting yet, so season shooting
                    percentages aren't available. ${basis}
                </p>
            </div>
        `;
    }

    const fullGames = teamGames.filter((game) => getShootingCoverage(game) === "full");
    const playerTotals = {};
    const teamTotals = {};

    fullGames.forEach((game) => {
        Object.entries(game.playerStatsById || {}).forEach(([playerId, stats]) => {
            playerTotals[playerId] = addShotCounters(playerTotals[playerId] || {}, stats);
        });

        addShotCounters(teamTotals, getTeamShotCounters(game.teamStats));
    });

    const creditedToPlayers = Object.values(playerTotals).reduce(
        (total, stats) => addShotCounters(total, stats),
        {}
    );

    const notCredited = {};

    shotKeys.forEach((key) => {
        notCredited[key] = Math.max(0, (teamTotals[key] || 0) - (creditedToPlayers[key] || 0));
    });

    const playerRows = team.roster
        .filter((player) => hasShotAttempts(playerTotals[player.id]))
        .map((player) =>
            renderShotRow(
                `#${player.number || "—"} ${player.name || "Unnamed"}`,
                playerTotals[player.id],
                true
            )
        )
        .join("");

    return `
        <div class="reportPlayerStats seasonShootingSection">
            <h4>Player Shooting (Season)</h4>
            <p class="shootingCoverageNote">${basis}</p>

            <div class="reportPlayerTableWrap">
                <table class="reportPlayerTable shootingTable">
                    ${renderShotTableHead("Player")}
                    <tbody>
                        ${playerRows}
                        ${
                            hasShotAttempts(notCredited)
                                ? renderShotRow("Unknown shooter", notCredited, true, "unknownShooterRow")
                                : ""
                        }
                        ${renderShotRow("Team totals", teamTotals, true, "summaryTotalsRow")}
                    </tbody>
                </table>
            </div>
        </div>
    `;
}

// One player's shooting, game by game, with each game's coverage.
function renderPlayerShootingByGame(playerGames, playerId) {
    const trackedGames = playerGames.filter(
        (game) => getShootingCoverage(game) !== "none"
    );

    if (trackedGames.length === 0) {
        return "";
    }

    const rows = playerGames
        .map((game) => {
            if (!getPlayersWhoPlayed(game).has(playerId)) {
                return `
                    <tr class="dnpRow">
                        <td>${game.gameDate || "—"}</td>
                        <td>${game.opponent || "—"}</td>
                        <td colspan="${shotReportColumns.length + 1}">DNP</td>
                    </tr>
                `;
            }

            const coverage = getShootingCoverage(game);
            const stats = game.playerStatsById?.[playerId] || {};

            const cells =
                coverage === "none"
                    ? shotReportColumns.map(() => "<td>—</td>").join("")
                    : shotReportColumns
                          .map((column) => formatShotCell(stats, column, coverage === "full"))
                          .join("");

            return `
                <tr>
                    <td>${game.gameDate || "—"}</td>
                    <td>${game.opponent || "—"}</td>
                    ${cells}
                    <td>${coverageLabels[coverage]}</td>
                </tr>
            `;
        })
        .join("");

    return `
        <h4 class="playerShootingByGameHeading">Shooting by Game</h4>
        <p class="shootingCoverageNote">
            Percentages are shown only for games with full individual shooting.
        </p>
        <div class="reportPlayerTableWrap">
            <table class="reportPlayerTable shootingTable">
                <thead>
                    <tr>
                        <th>Date</th>
                        <th>Opp</th>
                        ${shotReportColumns.map((column) => `<th>${column.label}</th>`).join("")}
                        <th>Tracking</th>
                    </tr>
                </thead>
                <tbody>${rows}</tbody>
            </table>
        </div>
    `;
}

// ---------- Season reports: games played, tracked stats, averages ----------

// Counted player stats (everything except Points and settings).
function getPlayerCounterStatKeys() {
    return playerStats
        .map((stat) => stat.key)
        .filter((statKey) => isPlayerCounterStat(statKey));
}

function hasRecordedValue(stats) {
    return Object.values(stats || {}).some(
        (value) => typeof value === "number" && value !== 0
    );
}

// Players who played in a saved game: starters, players who came in as a
// substitute, and anyone who recorded a statistic. One credit per game.
function getPlayersWhoPlayed(game) {
    const played = new Set([
        ...(game.gameStarters || []),
        ...(game.subbedInPlayerIds || [])
    ]);

    Object.entries(game.playerStatsById || {}).forEach(([playerId, stats]) => {
        if (hasRecordedValue(stats)) {
            played.add(playerId);
        }
    });

    return played;
}

// How much participation evidence a saved game has:
// "full"             — starters and substitutions were recorded,
// "startersAndStats" — saved before substitutions were recorded,
// "statsOnly"        — saved before starters were recorded too.
function getParticipationEvidence(game) {
    if (game.participationTracked) {
        return "full";
    }

    return Array.isArray(game.gameStarters) && game.gameStarters.length > 0
        ? "startersAndStats"
        : "statsOnly";
}

// Player stats tracked in a saved game: the game's chosen stats (or, for
// games saved before choices were stored, the stats every player was given at
// the start), plus any stat with a recorded value (e.g. turned off mid-game).
function getTrackedPlayerStatKeys(game) {
    const players = Object.values(game.playerStatsById || {});
    const tracked = new Set();

    if (Array.isArray(game.selectedPlayerStats)) {
        game.selectedPlayerStats.forEach((statKey) => tracked.add(statKey));
    } else {
        getPlayerCounterStatKeys().forEach((statKey) => {
            if (players.some((stats) => statKey in stats)) {
                tracked.add(statKey);
            }
        });
    }

    [...getPlayerCounterStatKeys(), "points"].forEach((statKey) => {
        if (players.some((stats) => (Number(stats[statKey]) || 0) !== 0)) {
            tracked.add(statKey);
        }
    });

    return tracked;
}

// Team stats tracked in a saved game: the game's chosen team stats, or for
// games saved before choices were stored, the stats in its team totals.
function getTrackedTeamStatKeys(game) {
    return (
        Array.isArray(game.selectedTeamStats)
            ? game.selectedTeamStats
            : Object.keys(game.teamStats || {})
    ).filter((statKey) => !isTeamStatSetting(statKey));
}

// A Team Averages card: only games where that team stat was tracked.
// Shooting shows makes / attempts per game and total made ÷ total attempted.
function getSeasonTeamStatAverage(teamGames, statKey) {
    const trackedGames = teamGames.filter((game) =>
        getTrackedTeamStatKeys(game).includes(statKey)
    );

    const gameCount = trackedGames.length;
    const gamesLabel =
        gameCount < teamGames.length
            ? `${gameCount} of ${teamGames.length} games`
            : "";

    if (gameCount === 0) {
        return { statKey, average: "—", gamesLabel };
    }

    if (
        statKey === "fieldGoals" ||
        statKey === "threePointers" ||
        statKey === "freeThrows"
    ) {
        let made = 0;
        let attempted = 0;

        trackedGames.forEach((game) => {
            made += Number(game.teamStats?.[statKey]?.made) || 0;
            attempted += Number(game.teamStats?.[statKey]?.attempted) || 0;
        });

        const percentage =
            attempted > 0 ? `${Math.round((made / attempted) * 100)}%` : "—";

        return {
            statKey,
            average:
                `${(made / gameCount).toFixed(1)} / ` +
                `${(attempted / gameCount).toFixed(1)}`,
            percentage,
            gamesLabel
        };
    }

    const total = trackedGames.reduce(
        (sum, game) => sum + (Number(game.teamStats?.[statKey]) || 0),
        0
    );

    return {
        statKey,
        average: (total / gameCount).toFixed(1),
        gamesLabel
    };
}

// Which Player Season Stats table is showing; Averages by default.
let seasonStatsView = "averages";

const seasonColumnOrder = [
    "rebounds",
    "offensiveRebounds",
    "defensiveRebounds",
    "assists",
    "steals",
    "blocks",
    "turnovers",
    "fouls"
];

const seasonColumnLabels = {
    rebounds: "REB",
    offensiveRebounds: "OREB",
    defensiveRebounds: "DREB",
    assists: "AST",
    steals: "STL",
    blocks: "BLK",
    turnovers: "TO",
    fouls: "PF"
};

// Each player's games played, and for every stat the season total and the
// number of games it covers (games where it was tracked and the player
// played). REB only uses games where both rebound stats were tracked.
function getSeasonPlayerStats(teamGames, team) {
    const gameInfo = teamGames.map((game) => ({
        game,
        played: getPlayersWhoPlayed(game),
        tracked: getTrackedPlayerStatKeys(game)
    }));

    const seasonTracked = new Set();

    gameInfo.forEach(({ tracked }) => {
        tracked.forEach((statKey) => seasonTracked.add(statKey));

        if (tracked.has("offensiveRebounds") && tracked.has("defensiveRebounds")) {
            seasonTracked.add("rebounds");
        }
    });

    const columns = seasonColumnOrder.filter((statKey) => seasonTracked.has(statKey));

    const players = team.roster.map((player) => {
        const totals = {};
        const games = {};
        let gamesPlayed = 0;

        const add = (statKey, value) => {
            totals[statKey] = (totals[statKey] || 0) + value;
            games[statKey] = (games[statKey] || 0) + 1;
        };

        gameInfo.forEach(({ game, played, tracked }) => {
            if (!played.has(player.id)) {
                return;
            }

            gamesPlayed += 1;

            const stats = game.playerStatsById?.[player.id] || {};

            if (tracked.has("points")) {
                add("points", Number(stats.points) || 0);
            }

            getPlayerCounterStatKeys().forEach((statKey) => {
                if (tracked.has(statKey)) {
                    add(statKey, Number(stats[statKey]) || 0);
                }
            });

            if (tracked.has("offensiveRebounds") && tracked.has("defensiveRebounds")) {
                add(
                    "rebounds",
                    (Number(stats.offensiveRebounds) || 0) +
                        (Number(stats.defensiveRebounds) || 0)
                );
            }
        });

        return { player, gamesPlayed, totals, games };
    });

    return { columns, players, gameInfo };
}

// An average or total. Averages divide by the games where the stat was
// tracked and the player played (which can be fewer than GP).
function formatSeasonCell(row, statKey, view) {
    const games = row.games[statKey] || 0;

    if (games === 0) {
        return "<td>—</td>";
    }

    const total = row.totals[statKey] || 0;
    const value = view === "averages" ? (total / games).toFixed(1) : total;

    return `<td>${value}</td>`;
}

function renderSeasonPlayerTable(season, view) {
    const headers = season.columns
        .map((statKey) => `<th>${seasonColumnLabels[statKey]}</th>`)
        .join("");

    const rows = season.players
        .map((row) => {
            const points = row.totals.points || 0;
            const pointGames = row.games.points || 0;

            return `
                <tr>
                    <td class="seasonPlayerName">#${row.player.number || "—"} ${row.player.name || "Unnamed"}</td>
                    <td>${row.gamesPlayed}</td>
                    <td class="seasonPoints">${pointGames ? points : "—"}</td>
                    ${formatSeasonCell(row, "points", "averages").replace("<td>", '<td class="seasonPoints">')}
                    ${season.columns.map((statKey) => formatSeasonCell(row, statKey, view)).join("")}
                </tr>
            `;
        })
        .join("");

    return `
        <table class="reportPlayerTable seasonPlayerTable">
            <thead>
                <tr>
                    <th>Player</th>
                    <th>GP</th>
                    <th>PTS</th>
                    <th>PPG</th>
                    ${headers}
                </tr>
            </thead>
            <tbody>${rows}</tbody>
        </table>
    `;
}

// Player Season Stats: Averages (default) or Totals. PTS and PPG show in both.
function renderSeasonPlayerSection(teamGames, team) {
    const season = getSeasonPlayerStats(teamGames, team);

    const olderGames = season.gameInfo.filter(
        ({ game }) => getParticipationEvidence(game) !== "full"
    ).length;

    const statsOnlyGames = season.gameInfo.filter(
        ({ game }) => getParticipationEvidence(game) === "statsOnly"
    ).length;

    const limitationNote = olderGames
        ? `
            <p class="seasonNote seasonLimitationNote">
                ${olderGames} of ${teamGames.length} game${teamGames.length === 1 ? "" : "s"}
                ${olderGames === 1 ? "was" : "were"} saved before Court94 recorded substitutions.
                In ${olderGames === 1 ? "that game" : "those games"}, players who came off the bench
                without recording a stat aren't counted as having played.
                ${
                    statsOnlyGames
                        ? `${statsOnlyGames} of them also didn't save starters, so only players with recorded stats are counted.`
                        : ""
                }
            </p>
        `
        : "";

    return `
        <div class="reportPlayerStats seasonPlayerSection" data-view="${seasonStatsView}">
            <div class="seasonPlayerHeader">
                <h4>Player Season Stats</h4>

                <div class="seasonViewSwitch" role="group" aria-label="Show averages or totals">
                    <button type="button" data-season-view="averages">Averages</button>
                    <button type="button" data-season-view="totals">Totals</button>
                </div>
            </div>

            <p class="seasonNote">
                Season averages use only games in which each statistic was tracked.
            </p>

            ${limitationNote}

            <div class="reportPlayerTableWrap seasonTableAverages">
                ${renderSeasonPlayerTable(season, "averages")}
            </div>

            <div class="reportPlayerTableWrap seasonTableTotals">
                ${renderSeasonPlayerTable(season, "totals")}
            </div>
        </div>
    `;
}

// ---------- Participation (games played) ----------

// Called only when a substitution actually completes (a SUB OUT paired with
// a SUB IN). Pending or cancelled taps never get here. One entry per player.
function recordSubstitutionIn(playerId) {
    if (!liveGameState) {
        return;
    }

    if (!Array.isArray(liveGameState.subbedInPlayerIds)) {
        liveGameState.subbedInPlayerIds = [];
    }

    if (!liveGameState.subbedInPlayerIds.includes(playerId)) {
        liveGameState.subbedInPlayerIds.push(playerId);
    }
}

// Substitutes saved with a finished game. As a safety net, anyone on the
// court at the end who wasn't a starter is included (this also covers a game
// that was already in progress before substitutions were recorded).
function getFinalSubbedInPlayerIds(game) {
    const starters = game.gameStarters || [];
    const subbedIn = [...(game.subbedInPlayerIds || [])];

    (game.currentFive || []).forEach((playerId) => {
        if (!starters.includes(playerId) && !subbedIn.includes(playerId)) {
            subbedIn.push(playerId);
        }
    });

    return subbedIn;
}

// ---------- Opponent scoring and lineup plus/minus ----------
//
// While Opponent Scoring is on, every basket (ours and the opponent's) is
// added to the game's scoringLog with the five players on the court at that
// moment. Lineup and player plus/minus are always worked out from the log,
// never kept as running totals, so Undo only has to remove the basket's
// entry. Games that never turn Opponent Scoring on store nothing extra.
//
// scoringLog: {
//     lineups: [[playerId, ...]]  — each distinct five, sorted, so player
//                                   order and court position don't matter
//     events: [{ id, type: "for" | "against" | "lineup", lineup, period,
//                points, bothTracked }]
//     nextEventId
// }
// scoringTracking: [{ period, opponentScoring, points }] — the settings at
// the start of the game and after every change. bothTracked marks baskets
// recorded while both teams' scoring was tracked; only those count toward
// plus/minus.

function isOpponentScoringOn() {
    const team = getSelectedTeam();

    return Boolean(
        liveGameState &&
        team &&
        getGameStatKeys(liveGameState, team, "selectedTeamStats")
            .includes("opponentScoring")
    );
}

function getScoringTrackingState() {
    return {
        period: liveGameState.period,
        opponentScoring: isOpponentScoringOn(),
        points: isTrackingPlayerPoints()
    };
}

// A game started before this was recorded (e.g. in progress during an
// update) begins with Opponent Scoring off, since it didn't exist yet.
function ensureScoringTracking() {
    if (!liveGameState || Array.isArray(liveGameState.scoringTracking)) {
        return;
    }

    liveGameState.scoringTracking = [
        { ...getScoringTrackingState(), opponentScoring: false }
    ];
}

// After Edit Game Setup. A change made before anything has been recorded
// in the first period just replaces the starting settings.
function noteScoringTrackingChange() {
    ensureScoringTracking();

    const tracking = liveGameState.scoringTracking;
    const previous = tracking[tracking.length - 1];
    const now = getScoringTrackingState();

    if (
        previous.opponentScoring === now.opponentScoring &&
        previous.points === now.points
    ) {
        return;
    }

    const firstPeriod =
        liveGameState.gameFormat === "Halves" ? "1st Half" : "Q1";

    if (
        liveActionHistory.length === 0 &&
        liveGameState.period === firstPeriod
    ) {
        liveGameState.scoringTracking = [now];
    } else {
        tracking.push(now);
    }

    // The five on the court when tracking starts.
    addScoringLogEvent("lineup");
}

function getScoringLog() {
    if (!liveGameState.scoringLog) {
        liveGameState.scoringLog = {
            lineups: [],
            events: [],
            nextEventId: 1
        };
    }

    return liveGameState.scoringLog;
}

function getLineupIndex(log, playerIds) {
    const lineup = [...new Set(playerIds.map(String))].sort();
    const lineupKey = lineup.join("|");

    const index = log.lineups.findIndex(
        (savedLineup) => savedLineup.join("|") === lineupKey
    );

    if (index !== -1) {
        return index;
    }

    log.lineups.push(lineup);
    return log.lineups.length - 1;
}

// Adds a basket ("for" / "against") or a lineup change ("lineup") with the
// five on the court right now. Only while Opponent Scoring is on. Returns
// the entry's id, which the Undo entry keeps, or null.
function addScoringLogEvent(type, points = 0) {
    if (!isOpponentScoringOn()) {
        return null;
    }

    const log = getScoringLog();

    const event = {
        id: log.nextEventId,
        type,
        lineup: getLineupIndex(log, liveGameState.currentFive || []),
        period: liveGameState.period
    };

    log.nextEventId += 1;

    if (type !== "lineup") {
        event.points = points;
        event.bothTracked = isTrackingPlayerPoints();
    }

    log.events.push(event);
    return event.id;
}

// Undo removes exactly the entry its basket added, whichever lineup it
// belongs to.
function removeScoringLogEvent(eventId) {
    const log = liveGameState?.scoringLog;

    if (!log || eventId === undefined || eventId === null) {
        return;
    }

    log.events = log.events.filter((event) => event.id !== eventId);
}

// Our points as recorded (players plus TEAM unknown shooters).
function getRecordedTeamPoints(game) {
    return (
        Object.values(game?.playerStatsById || {}).reduce(
            (sum, playerStats) => sum + (playerStats.points || 0),
            0
        ) + (game?.unknownShooterStats?.points || 0)
    );
}

function getTrackedOpponentPoints(game) {
    return (game?.scoringLog?.events || [])
        .filter((event) => event.type === "against")
        .reduce((sum, event) => sum + (event.points || 0), 0);
}

function recordOpponentPoints(points) {
    if (!isOpponentScoringOn()) {
        return;
    }

    liveActionHistory.push({
        type: "opponentPoints",
        amount: points,
        period: liveGameState.period,
        scoringEventId: addScoringLogEvent("against", points),
        description: `Opponent — +${points} Point${points === 1 ? "" : "s"}`
    });

    renderOpponentScoring();
    renderLastAction();
    saveLiveGameState();
}

// Opponent UNDO: the most recent opponent basket only.
function undoOpponentPoints() {
    for (let i = liveActionHistory.length - 1; i >= 0; i -= 1) {
        const action = liveActionHistory[i];

        if (action.type !== "opponentPoints") {
            continue;
        }

        removeScoringLogEvent(action.scoringEventId);
        liveActionHistory.splice(i, 1);

        renderOpponentScoring();
        renderLastAction();
        saveLiveGameState();
        return;
    }
}

// The red opponent controls: shown only while Opponent Scoring is on.
function renderOpponentScoring() {
    const controls = document.getElementById("opponentScoring");

    if (!controls) {
        return;
    }

    const isOn = isOpponentScoringOn();

    controls.hidden = !isOn;

    document
        .getElementById("liveGameScreen")
        .classList.toggle("opponentScoringOn", isOn);

    if (!isOn) {
        return;
    }

    document.getElementById("liveOpponentPointTotal").textContent =
        getTrackedOpponentPoints(liveGameState);

    document.getElementById("opponentUndoButton").disabled =
        !liveActionHistory.some(
            (action) => action.type === "opponentPoints"
        );
}

// ---------- Lineup report ----------

// "full" when the setting was on at the start and never changed, "partial"
// when it was on for part of the game, "none" when never on (or the game was
// saved before this was recorded).
function getScoringCoverage(game, settingName) {
    const tracking = Array.isArray(game?.scoringTracking)
        ? game.scoringTracking
        : [];

    const onCount = tracking.filter((entry) => entry[settingName]).length;

    if (onCount === 0) {
        return "none";
    }

    return onCount === tracking.length ? "full" : "partial";
}

// What a game's lineup report can show:
// "plusMinus"     — both teams' scoring was tracked for at least part of it,
// "pointsAllowed" — opponent scoring only (Points was off),
// "none"          — Opponent Scoring was never on.
function getLineupReportMode(game) {
    const tracking = Array.isArray(game?.scoringTracking)
        ? game.scoringTracking
        : [];

    if (tracking.some((entry) => entry.opponentScoring && entry.points)) {
        return "plusMinus";
    }

    if (tracking.some((entry) => entry.opponentScoring)) {
        return "pointsAllowed";
    }

    return "none";
}

function getLineupReportCoverage(game, mode) {
    if (mode === "pointsAllowed") {
        return getScoringCoverage(game, "opponentScoring");
    }

    return getScoringCoverage(game, "opponentScoring") === "full" &&
        getScoringCoverage(game, "points") === "full"
        ? "full"
        : "partial";
}

// Lineup and player totals from the log. Plus/minus counts only baskets
// recorded while both teams' scoring was tracked; Points Allowed counts
// every opponent basket.
function getLineupTotals(game, mode) {
    const log = game.scoringLog || { lineups: [], events: [] };
    const lineupRows = new Map();
    const playerRows = new Map();

    const countedEvents = log.events.filter((event) =>
        mode === "plusMinus"
            ? (event.type === "for" || event.type === "against") &&
              event.bothTracked
            : event.type === "against"
    );

    const addPoints = (row, event) => {
        if (event.type === "for") {
            row.pointsFor += event.points || 0;
        } else {
            row.pointsAgainst += event.points || 0;
        }
    };

    countedEvents.forEach((event) => {
        const lineup = log.lineups[event.lineup] || [];

        if (!lineupRows.has(event.lineup)) {
            lineupRows.set(event.lineup, {
                playerIds: lineup,
                firstEventId: event.id,
                pointsFor: 0,
                pointsAgainst: 0
            });
        }

        addPoints(lineupRows.get(event.lineup), event);

        lineup.forEach((playerId) => {
            if (!playerRows.has(playerId)) {
                playerRows.set(playerId, {
                    playerId,
                    pointsFor: 0,
                    pointsAgainst: 0
                });
            }

            addPoints(playerRows.get(playerId), event);
        });
    });

    return {
        lineups: [...lineupRows.values()],
        players: [...playerRows.values()]
    };
}

function formatPlusMinus(value) {
    if (value > 0) {
        return `+${value}`;
    }

    return value < 0 ? `−${Math.abs(value)}` : "0";
}

function describeScoringTrackingChanges(game) {
    const tracking = game.scoringTracking || [];

    return tracking.slice(1).map((entry, index) => {
        const previous = tracking[index];
        const changes = [];

        if (entry.opponentScoring !== previous.opponentScoring) {
            changes.push(
                `Opponent Scoring turned ${entry.opponentScoring ? "on" : "off"}`
            );
        }

        if (entry.points !== previous.points) {
            changes.push(`Points turned ${entry.points ? "on" : "off"}`);
        }

        return `${changes.join(" and ")} in ${entry.period}.`;
    });
}

function renderLineupNote(kind, text) {
    return `<p class="lineupNote lineupNote${kind}">${text}</p>`;
}

// The Lineup Plus/Minus section for a live, end-of-game or saved game.
// finalScore is { team, opponent } (opponent null until it's entered), or
// null while the game is live. Returns "" when the game has no lineup data.
function renderLineupPlusMinusSection(game, team, finalScore) {
    const mode = getLineupReportMode(game);

    if (mode === "none") {
        return "";
    }

    const coverage = getLineupReportCoverage(game, mode);
    const totals = getLineupTotals(game, mode);
    const isPlusMinus = mode === "plusMinus";
    const notes = [];

    // 1. Was scoring tracked for the whole game?
    if (coverage === "full") {
        notes.push(renderLineupNote(
            "Ok",
            isPlusMinus
                ? "Whole game: both teams' scoring was tracked from start to finish."
                : "Whole game: opponent scoring was tracked from start to finish."
        ));
    } else {
        notes.push(renderLineupNote(
            "Warn",
            (isPlusMinus
                ? "<strong>Partial game.</strong> Both teams' scoring was tracked for only part of this game. These numbers include only baskets from those stretches and are not full-game results."
                : "<strong>Partial game.</strong> Opponent scoring was tracked for only part of this game. These numbers are not full-game results.") +
                " " +
                describeScoringTrackingChanges(game).join(" ")
        ));
    }

    if (!isPlusMinus) {
        notes.push(renderLineupNote(
            "Info",
            "Points was off while Opponent Scoring was on, so only Points Allowed is shown. Plus/minus needs both."
        ));
    }

    // 2. Do the recorded points match the final score?
    const recordedTeamPoints = getRecordedTeamPoints(game);
    const recordedOpponentPoints = getTrackedOpponentPoints(game);

    if (!finalScore || finalScore.opponent === null) {
        notes.push(renderLineupNote(
            "Info",
            `Recorded so far: ${isPlusMinus ? `${team.teamName} ${recordedTeamPoints}, ` : ""}Opponent ${recordedOpponentPoints}. These are checked against the final score once it's entered.`
        ));
    } else {
        const teamMatches =
            !isPlusMinus || recordedTeamPoints === finalScore.team;
        const opponentMatches =
            recordedOpponentPoints === finalScore.opponent;

        notes.push(
            teamMatches && opponentMatches
                ? renderLineupNote(
                      "Ok",
                      `Recorded points match the final score (${finalScore.team}–${finalScore.opponent}).`
                  )
                : renderLineupNote(
                      "Warn",
                      `<strong>Recorded points don't match the final score.</strong> Recorded: ${isPlusMinus ? `${team.teamName} ${recordedTeamPoints}, ` : ""}Opponent ${recordedOpponentPoints}. Final: ${finalScore.team}–${finalScore.opponent}. Lineup numbers include recorded points only.`
                  )
        );
    }

    const rosterById = new Map(
        (team.roster || []).map((player) => [String(player.id), player])
    );

    const playerLabel = (playerId) => {
        const player = rosterById.get(String(playerId));

        return player
            ? `#${player.number || "—"} ${player.name || "Unnamed"}`
            : "Removed player";
    };

    const sortPlayerIds = (playerIds) =>
        [...playerIds].sort((a, b) => {
            const playerA = rosterById.get(String(a));
            const playerB = rosterById.get(String(b));

            if (!playerA || !playerB) {
                return playerA ? -1 : playerB ? 1 : 0;
            }

            return comparePlayersByFirstName(playerA, playerB);
        });

    const valueCells = (row) =>
        isPlusMinus
            ? `
                <td>${row.pointsFor}</td>
                <td>${row.pointsAgainst}</td>
                <td class="plusMinusCell">${formatPlusMinus(row.pointsFor - row.pointsAgainst)}</td>
            `
            : `<td>${row.pointsAgainst}</td>`;

    const valueHeads = isPlusMinus
        ? "<th>PF</th><th>PA</th><th>+/−</th>"
        : "<th>PA</th>";

    // Plus/minus: best first. Points Allowed: in the order lineups were used.
    const byPlusMinus = (a, b) =>
        (b.pointsFor - b.pointsAgainst) - (a.pointsFor - a.pointsAgainst) ||
        b.pointsFor - a.pointsFor;

    const lineupRows = [...totals.lineups]
        .sort(isPlusMinus ? byPlusMinus : (a, b) => a.firstEventId - b.firstEventId)
        .map((row) => {
            const incomplete =
                row.playerIds.length !== 5 ||
                row.playerIds.some((id) => !rosterById.has(String(id)));

            return `
                <tr>
                    <td class="lineupPlayersCell">
                        ${incomplete ? `<span class="lineupIncomplete">Incomplete lineup</span>` : ""}
                        ${sortPlayerIds(row.playerIds)
                            .map((id) => `<span class="lineupPlayer">${playerLabel(id)}</span>`)
                            .join("")}
                    </td>
                    ${valueCells(row)}
                </tr>
            `;
        })
        .join("");

    const playerRows = [...totals.players]
        .sort((a, b) => {
            const playerA = rosterById.get(String(a.playerId));
            const playerB = rosterById.get(String(b.playerId));
            const byName =
                playerA && playerB
                    ? comparePlayersByFirstName(playerA, playerB)
                    : 0;

            return isPlusMinus ? byPlusMinus(a, b) || byName : byName;
        })
        .map((row) => `
            <tr>
                <td class="lineupPlayerNameCell">${playerLabel(row.playerId)}</td>
                ${valueCells(row)}
            </tr>
        `)
        .join("");

    const emptyMessage = isPlusMinus
        ? "No baskets recorded yet while both teams' scoring was tracked."
        : "No opponent baskets recorded yet.";

    return `
        <div class="lineupNotes">${notes.join("")}</div>

        ${
            totals.lineups.length === 0
                ? `<p class="lineupEmpty">${emptyMessage}</p>`
                : `
                    <h4 class="lineupTableHeading">Lineups</h4>
                    <div class="boxScoreWrap">
                        <table class="boxScoreTable lineupTable">
                            <thead><tr><th>Five on the court</th>${valueHeads}</tr></thead>
                            <tbody>${lineupRows}</tbody>
                        </table>
                    </div>

                    <h4 class="lineupTableHeading">Players</h4>
                    <div class="boxScoreWrap">
                        <table class="boxScoreTable lineupTable">
                            <thead><tr><th>Player (while on the court)</th>${valueHeads}</tr></thead>
                            <tbody>${playerRows}</tbody>
                        </table>
                    </div>
                `
        }

        <p class="lineupKey">${
            isPlusMinus
                ? "PF = points scored by your team, PA = points allowed, +/− = PF minus PA, while those players were on the court."
                : "PA = points allowed while those players were on the court."
        }</p>
    `;
}

// Fills (or hides) a summary screen's Lineup Plus/Minus card.
function showLineupPlusMinusCard(cardId, contentId, game, team, finalScore) {
    const html = renderLineupPlusMinusSection(game, team, finalScore);
    const card = document.getElementById(cardId);

    card.hidden = !html;
    document.getElementById(contentId).innerHTML = html;

    card.querySelector("h3").textContent =
        getLineupReportMode(game) === "pointsAllowed"
            ? "Lineup Points Allowed"
            : "Lineup Plus/Minus";
}

// The end-of-game summary's opponent score, or null while it's blank.
function getEnteredOpponentScore() {
    const value =
        document.getElementById("summaryOpponentScore").value.trim();

    return value === "" ? null : Number(value) || 0;
}

function renderEndOfGameLineups() {
    const team = getSelectedTeam();

    if (!team || !liveGameState) {
        return;
    }

    showLineupPlusMinusCard(
        "summaryLineupCard",
        "summaryLineups",
        liveGameState,
        team,
        {
            team: getRecordedTeamPoints(liveGameState),
            opponent: getEnteredOpponentScore()
        }
    );
}

// ---------- Season lineup plus/minus (Reports) ----------

// Season Lineup Plus/Minus choices, remembered while the app is open.
let seasonLineupView = "lineups";
let seasonLineupIncludePartial = false;
let seasonLineupShowAll = false;

// The team and games the section was last built for, so the switches can
// rebuild just this section.
let seasonLineupContext = null;

const SEASON_LINEUP_LIMIT = 10;

// Season totals are the sum of each game's own lineup report
// (getLineupTotals), so they always match the individual game reports.
// Only games where both teams' scoring was tracked count: whole games
// always, partial games only when included. Points Allowed-only games and
// games without lineup data never count. GP is the number of distinct games
// with at least one counted basket while that lineup or player was on the
// court. Lineups are matched by their player IDs, in any order.
function getSeasonLineupTotals(teamGames, includePartial) {
    const games = {
        whole: [],
        partial: [],
        pointsAllowedOnly: [],
        noData: [],
        mismatched: []
    };

    const lineups = new Map();
    const players = new Map();

    const addRow = (map, key, details, row, isPartial) => {
        if (!map.has(key)) {
            map.set(key, {
                ...details,
                games: 0,
                partialGames: 0,
                pointsFor: 0,
                pointsAgainst: 0
            });
        }

        const total = map.get(key);

        total.games += 1;
        total.partialGames += isPartial ? 1 : 0;
        total.pointsFor += row.pointsFor;
        total.pointsAgainst += row.pointsAgainst;
    };

    teamGames.forEach((game) => {
        const mode = getLineupReportMode(game);

        if (mode === "none") {
            games.noData.push(game);
            return;
        }

        if (mode === "pointsAllowed") {
            games.pointsAllowedOnly.push(game);
            return;
        }

        const isPartial = getLineupReportCoverage(game, mode) !== "full";

        games[isPartial ? "partial" : "whole"].push(game);

        if (isPartial && !includePartial) {
            return;
        }

        if (
            !isPartial &&
            (getRecordedTeamPoints(game) !== (Number(game.teamScore) || 0) ||
                getTrackedOpponentPoints(game) !==
                    (Number(game.opponentScore) || 0))
        ) {
            games.mismatched.push(game);
        }

        const totals = getLineupTotals(game, "plusMinus");

        // One entry per distinct five in this game, so a lineup that comes
        // back later in the same game still counts as one game.
        const gameLineups = new Map();

        totals.lineups.forEach((row) => {
            const playerIds = [...new Set(row.playerIds.map(String))].sort();
            const key = playerIds.join("|");
            const gameRow = gameLineups.get(key) || {
                playerIds,
                pointsFor: 0,
                pointsAgainst: 0
            };

            gameRow.pointsFor += row.pointsFor;
            gameRow.pointsAgainst += row.pointsAgainst;
            gameLineups.set(key, gameRow);
        });

        gameLineups.forEach((row, key) =>
            addRow(lineups, key, { playerIds: row.playerIds }, row, isPartial)
        );

        totals.players.forEach((row) =>
            addRow(
                players,
                String(row.playerId),
                { playerId: String(row.playerId) },
                row,
                isPartial
            )
        );
    });

    return {
        games,
        lineups: [...lineups.values()],
        players: [...players.values()]
    };
}

function getSeasonLineupGameLabel(game) {
    return `vs ${game.opponent || "Opponent"}${game.gameDate ? ` (${game.gameDate})` : ""}`;
}

function renderSeasonLineupSection(teamGames, team, seasonName) {
    seasonLineupContext = { teamGames, team, season: seasonName };

    const season = getSeasonLineupTotals(
        teamGames,
        seasonLineupIncludePartial
    );

    const { games } = season;
    const plural = (count, word) => `${count} ${word}${count === 1 ? "" : "s"}`;

    const rosterById = new Map(
        (team.roster || []).map((player) => [String(player.id), player])
    );

    // Players no longer on the roster keep their own row, told apart by a
    // letter that stays the same whichever games are included.
    const removedIds = [
        ...new Set(
            [...games.whole, ...games.partial].flatMap((game) =>
                (game.scoringLog?.lineups || []).flat().map(String)
            )
        )
    ]
        .filter((id) => !rosterById.has(id))
        .sort();

    const playerLabel = (playerId) => {
        const player = rosterById.get(String(playerId));

        if (player) {
            return `#${player.number || "—"} ${player.name || "Unnamed"}`;
        }

        return removedIds.length > 1
            ? `Removed player ${String.fromCharCode(65 + removedIds.indexOf(String(playerId)))}`
            : "Removed player";
    };

    // Rostered players by first name; removed players after them.
    const comparePlayerIds = (a, b) => {
        const playerA = rosterById.get(String(a));
        const playerB = rosterById.get(String(b));

        if (playerA && playerB) {
            return comparePlayersByFirstName(playerA, playerB);
        }

        if (playerA || playerB) {
            return playerA ? -1 : 1;
        }

        return String(a).localeCompare(String(b));
    };

    // Best plus/minus first; ties by PF, then GP, then players' names.
    const byPlusMinus = (a, b) =>
        (b.pointsFor - b.pointsAgainst) - (a.pointsFor - a.pointsAgainst) ||
        b.pointsFor - a.pointsFor ||
        b.games - a.games;

    const compareLineupNames = (a, b) => {
        for (let index = 0; index < Math.max(a.length, b.length); index += 1) {
            if (a[index] === undefined || b[index] === undefined) {
                return a[index] === undefined ? -1 : 1;
            }

            const result = comparePlayerIds(a[index], b[index]);

            if (result) {
                return result;
            }
        }

        return 0;
    };

    const lineups = season.lineups
        .map((row) => ({
            ...row,
            playerIds: [...row.playerIds].sort(comparePlayerIds)
        }))
        .sort((a, b) =>
            byPlusMinus(a, b) || compareLineupNames(a.playerIds, b.playerIds)
        );

    const players = [...season.players].sort(
        (a, b) => byPlusMinus(a, b) || comparePlayerIds(a.playerId, b.playerId)
    );

    // What the numbers are based on, and what was left out.
    const counted = seasonLineupIncludePartial
        ? games.whole.length + games.partial.length
        : games.whole.length;

    const basedOn = seasonLineupIncludePartial && games.partial.length
        ? `Based on ${plural(games.whole.length, "whole game")} and ${plural(games.partial.length, "partial game")}.`
        : `Based on ${plural(games.whole.length, "whole game")}.`;

    const leftOut = [
        !seasonLineupIncludePartial && games.partial.length
            ? `${plural(games.partial.length, "partial game")} (tap Include partial games to add ${games.partial.length === 1 ? "it" : "them"})`
            : "",
        games.pointsAllowedOnly.length
            ? `${plural(games.pointsAllowedOnly.length, "game")} with Points Allowed only (Points was off, so there's no PF or +/−)`
            : "",
        games.noData.length
            ? `${plural(games.noData.length, "game")} without lineup data (Opponent Scoring was off)`
            : ""
    ].filter(Boolean);

    const notes = [
        renderLineupNote(
            games.whole.length ? "Info" : "Warn",
            `${basedOn}${leftOut.length ? ` Not included: ${leftOut.join("; ")}.` : ""}`
        )
    ];

    if (seasonLineupIncludePartial && games.partial.length) {
        notes.push(renderLineupNote(
            "Warn",
            `<strong>Partial games included:</strong> ${games.partial.map(getSeasonLineupGameLabel).join(", ")}. From ${games.partial.length === 1 ? "that game" : "those games"}, only baskets recorded while both teams' scoring was tracked are counted. Rows that use partial-game data have an amber edge and say how many of their games were partial under GP.`
        ));
    }

    if (games.mismatched.length) {
        notes.push(renderLineupNote(
            "Warn",
            `<strong>Recorded points don't match the final score in ${plural(games.mismatched.length, "whole game")}:</strong> ` +
                games.mismatched
                    .map((game) =>
                        `${getSeasonLineupGameLabel(game)}, recorded ${getRecordedTeamPoints(game)}–${getTrackedOpponentPoints(game)}, final ${Number(game.teamScore) || 0}–${Number(game.opponentScore) || 0}`
                    )
                    .join("; ") +
                (games.mismatched.length === 1
                    ? ". This game is included; its lineup numbers use the recorded baskets only."
                    : ". These games are included; their lineup numbers use the recorded baskets only.")
        ));
    }

    const gpCell = (row) => `
        <td class="seasonLineupGp">
            ${row.games}
            ${row.partialGames ? `<small class="seasonLineupPartial">${row.partialGames} partial</small>` : ""}
        </td>
    `;

    const valueCells = (row) => `
        ${gpCell(row)}
        <td>${row.pointsFor}</td>
        <td>${row.pointsAgainst}</td>
        <td class="plusMinusCell">${formatPlusMinus(row.pointsFor - row.pointsAgainst)}</td>
    `;

    const valueHeads = "<th>GP</th><th>PF</th><th>PA</th><th>+/−</th>";

    const shownLineups = seasonLineupShowAll
        ? lineups
        : lineups.slice(0, SEASON_LINEUP_LIMIT);

    const lineupTable = `
        <div class="boxScoreWrap">
            <table class="boxScoreTable lineupTable seasonLineupTable">
                <thead><tr><th>Five on the court</th>${valueHeads}</tr></thead>
                <tbody>
                    ${shownLineups
                        .map((row) => {
                            const incomplete =
                                row.playerIds.length !== 5 ||
                                row.playerIds.some((id) => !rosterById.has(String(id)));

                            return `
                                <tr class="${row.partialGames ? "seasonLineupPartialRow" : ""}">
                                    <td class="lineupPlayersCell">
                                        ${incomplete ? `<span class="lineupIncomplete">${row.playerIds.length !== 5 ? "Incomplete lineup" : "Includes a removed player"}</span>` : ""}
                                        ${row.playerIds
                                            .map((id) => `<span class="lineupPlayer">${playerLabel(id)}</span>`)
                                            .join("")}
                                    </td>
                                    ${valueCells(row)}
                                </tr>
                            `;
                        })
                        .join("")}
                </tbody>
            </table>
        </div>

        ${
            lineups.length > SEASON_LINEUP_LIMIT
                ? `
                    <button type="button" class="seasonLineupMoreButton" data-season-lineup-more>
                        ${seasonLineupShowAll ? `Show top ${SEASON_LINEUP_LIMIT} lineups` : `Show all ${lineups.length} lineups`}
                    </button>
                `
                : ""
        }
    `;

    const playerTable = `
        <div class="boxScoreWrap">
            <table class="boxScoreTable lineupTable seasonLineupTable">
                <thead><tr><th>Player (while on the court)</th>${valueHeads}</tr></thead>
                <tbody>
                    ${players
                        .map((row) => `
                            <tr class="${row.partialGames ? "seasonLineupPartialRow" : ""}">
                                <td class="lineupPlayerNameCell">${playerLabel(row.playerId)}</td>
                                ${valueCells(row)}
                            </tr>
                        `)
                        .join("")}
                </tbody>
            </table>
        </div>
    `;

    let body;

    if (games.whole.length + games.partial.length === 0) {
        body = `<p class="lineupEmpty">No games this season tracked both teams' scoring. Turn on Opponent Scoring (with Points) in the team's stats to build lineup plus/minus.</p>`;
    } else if (counted === 0) {
        body = `<p class="lineupEmpty">No whole games yet. Tap Include partial games to see the ${plural(games.partial.length, "partial game")}.</p>`;
    } else if (lineups.length === 0) {
        body = `<p class="lineupEmpty">No baskets were recorded while both teams' scoring was tracked.</p>`;
    } else {
        body = seasonLineupView === "players" ? playerTable : lineupTable;
    }

    return `
        <div class="reportSeasonLineups" id="seasonLineupSection" data-view="${seasonLineupView}" data-games="${seasonLineupIncludePartial ? "all" : "whole"}">
            <div class="seasonPlayerHeader">
                <h4>Season Lineup Plus/Minus</h4>
            </div>

            <div class="seasonLineupSwitches">
                <div class="seasonViewSwitch" role="group" aria-label="Show lineups or players">
                    <button type="button" data-season-lineup-view="lineups">Lineups</button>
                    <button type="button" data-season-lineup-view="players">Players</button>
                </div>

                <div class="seasonViewSwitch" role="group" aria-label="Whole games only or include partial games">
                    <button type="button" data-season-lineup-games="whole">Whole games</button>
                    <button type="button" data-season-lineup-games="all">Include partial games</button>
                </div>
            </div>

            <div class="lineupNotes">${notes.join("")}</div>

            <p class="seasonNote seasonLineupGpNote">
                <strong>GP here is not games played.</strong> It counts the games in which
                ${seasonLineupView === "players" ? "the player was on the court" : "that exact five was on the court together"}
                for at least one basket by either team.
            </p>

            ${body}

            <p class="lineupKey">
                PF = points your team scored, PA = points allowed, +/− = PF minus PA, while
                ${seasonLineupView === "players" ? "the player was" : "those five were"} on the court.
                Only baskets recorded while both teams' scoring was tracked count.
                Sorted by +/−, then PF, then GP, then name.
            </p>
        </div>
    `;
}

// Rebuilds only the Season Lineup Plus/Minus section after a switch.
function refreshSeasonLineupSection() {
    const section = document.getElementById("seasonLineupSection");

    if (!section || !seasonLineupContext) {
        return;
    }

    section.outerHTML = renderSeasonLineupSection(
        seasonLineupContext.teamGames,
        seasonLineupContext.team,
        seasonLineupContext.season
    );
}

function getPlayerMissTotal(playerId, shotType) {
    const shot = shotTypes[shotType];

    return Math.max(
        0,
        getPlayerStatTotal(playerId, shot.attemptedKey) -
            getPlayerStatTotal(playerId, shot.madeKey)
    );
}

function recordPlayerPoints(points) {
    const team = getSelectedTeam();

    const player = team.roster.find(
        (item) =>
            item.id === selectedLivePlayerId
    );

    if (!player) {
        return;
    }

    const shotType = getShotTypeForPoints(points);

    applyPlayerShot(
        player.id,
        shotType,
        true,
        1,
        liveGameState.period
    );

    liveActionHistory.push({
        type: "playerPoints",
        playerId: player.id,
        amount: points,
        linkedTeamStat:
    points === 2
        ? "fieldGoals"
        : points === 3
        ? "threePointers"
        : null,
        shotType,
        // Marks entries whose Undo also reverses the player's
        // shooting counters. Entries from older games don't have it.
        shotCountersRecorded: true,
        // The basket's lineup-log entry (null while Opponent Scoring is off).
        scoringEventId: addScoringLogEvent("for", points),
        period: liveGameState.period,
        description:
            `#${player.number || "—"} ${player.name} — +${points} Point${
                points === 1 ? "" : "s"
            }`
    });

    renderPlayerBench();
renderPlayerStatButtons();
renderTeamStatButtons();
updateLiveTeamPointTotal();
renderLastAction();

saveLiveGameState();
}

function recordPlayerMiss(shotType) {
    const team = getSelectedTeam();

    const player = team.roster.find(
        (item) =>
            item.id === selectedLivePlayerId
    );

    const shot = shotTypes[shotType];

    if (!player || !shot) {
        return;
    }

    applyPlayerShot(
        player.id,
        shotType,
        false,
        1,
        liveGameState.period
    );

    liveActionHistory.push({
        type: "playerMiss",
        playerId: player.id,
        shotType,
        period: liveGameState.period,
        description:
            `#${player.number || "—"} ${player.name} — ${shot.label} Miss`
    });

    renderPlayerStatButtons();
    renderLastAction();
    renderTeamStatButtons();

    saveLiveGameState();
}

function recordPlayerStat(statKey) {
    const team = getSelectedTeam();

    const player = team.roster.find(
        (item) =>
            item.id === selectedLivePlayerId
    );

    const stat = playerStats.find(
        (item) => item.key === statKey
    );

    if (!player || !stat || !isPlayerCounterStat(statKey)) {
        return;
    }

    const playerState =
        liveGameState.playerStatsById[
            selectedLivePlayerId
        ];

    playerState[statKey] =
        (playerState[statKey] || 0) + 1;

        const currentPeriod =
    liveGameState.period;

const periodPlayerState =
    liveGameState.playerStatsByPeriod[
        currentPeriod
    ][selectedLivePlayerId];

periodPlayerState[statKey] =
    (periodPlayerState[statKey] || 0) + 1;

    // Link Player Defensive Rebound to Team Defensive Rebound
if (statKey === "defensiveRebounds") {

    liveGameState.teamStats.defensiveRebounds =
        (liveGameState.teamStats.defensiveRebounds || 0) + 1;

    if (!liveGameState.teamStatsByPeriod[currentPeriod]) {
        liveGameState.teamStatsByPeriod[currentPeriod] = {};
    }

    liveGameState.teamStatsByPeriod[currentPeriod].defensiveRebounds =
        (
            liveGameState.teamStatsByPeriod[currentPeriod]
                .defensiveRebounds || 0
        ) + 1;
}

// Link Player Offensive Rebound to Team Offensive Rebound
if (statKey === "offensiveRebounds") {
    liveGameState.teamStats.offensiveRebounds =
        (liveGameState.teamStats.offensiveRebounds || 0) + 1;

    if (!liveGameState.teamStatsByPeriod[currentPeriod]) {
        liveGameState.teamStatsByPeriod[currentPeriod] = {};
    }

    liveGameState.teamStatsByPeriod[currentPeriod].offensiveRebounds =
        (
            liveGameState.teamStatsByPeriod[currentPeriod]
                .offensiveRebounds || 0
        ) + 1;
}

// Link Player Turnover to Team Turnover
if (statKey === "turnovers") {
    liveGameState.teamStats.turnovers =
        (liveGameState.teamStats.turnovers || 0) + 1;

    if (!liveGameState.teamStatsByPeriod[currentPeriod]) {
        liveGameState.teamStatsByPeriod[currentPeriod] = {};
    }

    liveGameState.teamStatsByPeriod[currentPeriod].turnovers =
        (
            liveGameState.teamStatsByPeriod[currentPeriod]
                .turnovers || 0
        ) + 1;
}

    liveActionHistory.push({
        type: "playerStat",
        playerId: player.id,
        statKey,
        amount: 1,
        period: liveGameState.period,
        description:
            `#${player.number || "—"} ${player.name} — ${stat.name}`
    });

    renderPlayerStatButtons();
renderLastAction();
renderTeamStatButtons();

saveLiveGameState();
}

function recordShootingResult(statKey, result) {
    if (!liveGameState) {
        return;
    }

    // With Points tracked, team-card shots belong to an unknown shooter.
    // Without Points, MAKE/MISS work exactly as before.
    if (isTrackingPlayerPoints()) {
        recordUnknownShot(statKey, result);
        return;
    }

    if (
        !liveGameState.teamStats[statKey] ||
        typeof liveGameState.teamStats[statKey] !== "object"
    ) {
        liveGameState.teamStats[statKey] = {
            made: 0,
            attempted: 0
        };
    }

    const shootingStat =
        liveGameState.teamStats[statKey];

    shootingStat.attempted += 1;

    if (result === "make") {
        shootingStat.made += 1;
    }

    const currentPeriod =
        liveGameState.period;

    if (!liveGameState.teamStatsByPeriod[currentPeriod]) {
        liveGameState.teamStatsByPeriod[currentPeriod] = {};
    }

    if (
        !liveGameState.teamStatsByPeriod[currentPeriod][statKey] ||
        typeof liveGameState.teamStatsByPeriod[currentPeriod][statKey] !== "object"
    ) {
        liveGameState.teamStatsByPeriod[currentPeriod][statKey] = {
            made: 0,
            attempted: 0
        };
    }

    const periodShootingStat =
        liveGameState.teamStatsByPeriod[
            currentPeriod
        ][statKey];

    periodShootingStat.attempted += 1;

    if (result === "make") {
        periodShootingStat.made += 1;
    }

    // Every 3-point attempt is also a field-goal attempt
if (statKey === "threePointers") {
    if (
        !liveGameState.teamStats.fieldGoals ||
        typeof liveGameState.teamStats.fieldGoals !== "object"
    ) {
        liveGameState.teamStats.fieldGoals = {
            made: 0,
            attempted: 0
        };
    }

    liveGameState.teamStats.fieldGoals.attempted += 1;

    if (result === "make") {
        liveGameState.teamStats.fieldGoals.made += 1;
    }

    if (
        !liveGameState.teamStatsByPeriod[currentPeriod].fieldGoals ||
        typeof liveGameState.teamStatsByPeriod[currentPeriod].fieldGoals !== "object"
    ) {
        liveGameState.teamStatsByPeriod[currentPeriod].fieldGoals = {
            made: 0,
            attempted: 0
        };
    }

    liveGameState.teamStatsByPeriod[currentPeriod].fieldGoals.attempted += 1;

    if (result === "make") {
        liveGameState.teamStatsByPeriod[currentPeriod].fieldGoals.made += 1;
    }
}
    liveActionHistory.push({
        type: "shootingStat",
        statKey,
        result,
        period: currentPeriod,
        description:
    result === "make"
        ? `${
              statKey === "fieldGoals"
                  ? "Field Goal"
                  : statKey === "threePointers"
                  ? "3-Pointer"
                  : "Free Throw"
          } — Make`
        : `${
              statKey === "fieldGoals"
                  ? "Field Goal"
                  : statKey === "threePointers"
                  ? "3-Pointer"
                  : "Free Throw"
          } — Miss`
    });

    renderTeamStatButtons();
    renderLastAction();

    saveLiveGameState();
}

function undoShootingResult(statKey) {
    if (!liveGameState) {
        return;
    }

    let actionIndex = -1;

    for (let i = liveActionHistory.length - 1; i >= 0; i -= 1) {
        const action = liveActionHistory[i];

        if (
            (
                action.type === "shootingStat" ||
                action.type === "unknownShot"
            ) &&
            action.statKey === statKey
        ) {
            actionIndex = i;
            break;
        }
    }

    if (actionIndex === -1) {
        return;
    }

    const action = liveActionHistory[actionIndex];

    if (action.type === "unknownShot") {
        applyUnknownShot(
            action.shotType,
            action.result === "make",
            -1,
            action.period || liveGameState.period
        );

        removeScoringLogEvent(action.scoringEventId);
        liveActionHistory.splice(actionIndex, 1);

        renderTeamStatButtons();
        renderLastAction();
        updateLiveTeamPointTotal();

        saveLiveGameState();
        return;
    }

    const shootingStat =
        liveGameState.teamStats[statKey];

    if (
        shootingStat &&
        typeof shootingStat === "object"
    ) {
        shootingStat.attempted = Math.max(
            0,
            shootingStat.attempted - 1
        );

        if (action.result === "make") {
            shootingStat.made = Math.max(
                0,
                shootingStat.made - 1
            );
        }
    }

    const periodShootingStat =
        liveGameState.teamStatsByPeriod?.[
            action.period
        ]?.[statKey];

    if (
        periodShootingStat &&
        typeof periodShootingStat === "object"
    ) {
        periodShootingStat.attempted = Math.max(
            0,
            periodShootingStat.attempted - 1
        );

        if (action.result === "make") {
            periodShootingStat.made = Math.max(
                0,
                periodShootingStat.made - 1
            );
        }
    }

    if (statKey === "threePointers") {
    const fieldGoals =
        liveGameState.teamStats.fieldGoals;

    if (fieldGoals && typeof fieldGoals === "object") {
        fieldGoals.attempted =
            Math.max(0, (fieldGoals.attempted || 0) - 1);

        if (action.result === "make") {
            fieldGoals.made =
                Math.max(0, (fieldGoals.made || 0) - 1);
        }
    }

    const periodFieldGoals =
        liveGameState.teamStatsByPeriod?.[
            action.period
        ]?.fieldGoals;

    if (
        periodFieldGoals &&
        typeof periodFieldGoals === "object"
    ) {
        periodFieldGoals.attempted =
            Math.max(
                0,
                (periodFieldGoals.attempted || 0) - 1
            );

        if (action.result === "make") {
            periodFieldGoals.made =
                Math.max(
                    0,
                    (periodFieldGoals.made || 0) - 1
                );
        }
    }
}
    liveActionHistory.splice(actionIndex, 1);

    renderTeamStatButtons();
    renderLastAction();

    saveLiveGameState();
}

function recordTeamStat(statKey, amount = 1) {
    
    const stat = teamStats.find(
        (item) => item.key === statKey
    );

    if (!stat) {
        return;
    }

    liveGameState.teamStats[statKey] =
    Math.max(
        0,
        (liveGameState.teamStats[statKey] || 0) + amount
    );

    const currentPeriod =
    liveGameState.period;

if (
    !liveGameState.teamStatsByPeriod[
        currentPeriod
    ]
) {
    liveGameState.teamStatsByPeriod[
        currentPeriod
    ] = {};
}

liveGameState.teamStatsByPeriod[
    currentPeriod
][statKey] =
    Math.max(
        0,
        (
            liveGameState.teamStatsByPeriod[
                currentPeriod
            ][statKey] || 0
        ) + amount
    );

    liveActionHistory.push({
        type: "teamStat",
        statKey,
        amount,
        period: liveGameState.period,
        description:
            `Team — ${stat.name}`
    });

    renderTeamStatButtons();
renderLastAction();

saveLiveGameState();
}

function recordTransitionPoints(points) {
    liveGameState.teamStats.transitionPoints =
        (
            liveGameState.teamStats.transitionPoints ||
            0
        ) + points;

        const currentPeriod =
    liveGameState.period;

if (
    !liveGameState.teamStatsByPeriod[
        currentPeriod
    ]
) {
    liveGameState.teamStatsByPeriod[
        currentPeriod
    ] = {};
}

liveGameState.teamStatsByPeriod[
    currentPeriod
].transitionPoints =
    (
        liveGameState.teamStatsByPeriod[
            currentPeriod
        ].transitionPoints || 0
    ) + points;

    liveActionHistory.push({
        type: "transitionPoints",
        statKey: "transitionPoints",
        amount: points,
        period: liveGameState.period,
        description:
            `Team — +${points} Transition Point${
                points === 1 ? "" : "s"
            }`
    });

    renderTeamStatButtons();
renderLastAction();

saveLiveGameState();
}

// A game's own stat choices ("selectedTeamStats" or "selectedPlayerStats"),
// falling back to the team's defaults for older games that didn't save them.
function getGameStatKeys(game, team, selectionName) {
    const gameStatKeys = game?.[selectionName];

    return [
        ...new Set(
            Array.isArray(gameStatKeys)
                ? gameStatKeys
                : team[selectionName] || []
        )
    ];
}

function renderLiveSummary() {
    const team = getSelectedTeam();

    if (!team || !liveGameState) {
        return;
    }

    const uniqueTeamStats =
        getGameStatKeys(liveGameState, team, "selectedTeamStats");

    const uniquePlayerStats =
        getGameStatKeys(liveGameState, team, "selectedPlayerStats");

    const periodColumns =
    currentGameSetup.gameFormat === "Halves"
        ? ["1st Half", "2nd Half", "OT"]
        : ["Q1", "Q2", "Q3", "Q4", "OT"];

        const orderedTeamStats = [
    ...uniqueTeamStats.filter(
        (statKey) =>
            statKey !== "fieldGoals" &&
            statKey !== "threePointers" &&
            statKey !== "freeThrows"
    ),
    ...uniqueTeamStats.filter(
        (statKey) =>
            statKey === "fieldGoals" ||
            statKey === "threePointers" ||
            statKey === "freeThrows"
    )
];
    const teamRows =
        orderedTeamStats
    .map((statKey) => {
                const stat = teamStats.find(
                    (item) => item.key === statKey
                );

                if (!stat) {
                    return "";
                }

                return `
                    <tr>
                        <td class="teamStatNameCell">
                            ${stat.name}
                        </td>

                        ${periodColumns
    .map((period) => {
        const periodValue =
            liveGameState.teamStatsByPeriod?.[
                period
            ]?.[statKey] || 0;
            const displayPeriodValue =
    statKey === "fieldGoals" ||
    statKey === "threePointers" ||
    statKey === "freeThrows"
        ? formatShootingStat(periodValue)
        : periodValue;

        return `
            <td>
                ${displayPeriodValue}
            </td>
        `;
    })
    .join("")}

<td>
    ${getTeamStatTotal(statKey)}
</td>
                    </tr>
                `;
            })
            .join("");

    document.getElementById(
        "liveSummaryTeamStats"
    ).innerHTML = `
        <div class="boxScoreWrap">
            <table class="boxScoreTable teamSummaryTable">
                <thead>
    <tr>
        <th>Stat</th>

        ${periodColumns
            .map((period) => {
                return `
                    <th>
                        ${period}
                    </th>
                `;
            })
            .join("")}

        <th>Total</th>
    </tr>
</thead>

                <tbody>
                    ${teamRows}
                </tbody>
            </table>
        </div>
    `;

    const playerStatColumns = [
        "points",
        ...uniquePlayerStats.filter(
            (statKey) => isPlayerCounterStat(statKey)
        )
    ];

    const playerHeaderCells =
        playerStatColumns
            .map((statKey) => {
                const stat = playerStats.find(
                    (item) => item.key === statKey
                );

                return `
                    <th>
                        ${
                            statKey === "points"
                                ? "PTS"
                                : stat?.name || statKey
                        }
                    </th>
                `;
            })
            .join("");

    const playerRows =
        team.roster
            .map((player) => {
                const statCells =
                    playerStatColumns
                        .map((statKey) => {
                            return `
                                <td>
                                    ${getPlayerStatTotal(
    player.id,
    statKey
)}
                                </td>
                            `;
                        })
                        .join("");

                return `
                    <tr>
                        <td>
                            ${player.number || "—"}
                        </td>

                        <td class="playerNameCell">
                            ${player.name || "Unnamed"}
                        </td>

                        ${statCells}
                    </tr>
                `;
            })
            .join("");

            const playerScoringTotals = periodColumns.map((period) => {
    return team.roster.reduce((total, player) => {
        const playerPeriodStats =
            liveGameState.playerStatsByPeriod?.[
                period
            ]?.[player.id];

        return total + (playerPeriodStats?.points || 0);
    }, 0) + getUnknownPeriodPoints(liveGameState, period);
});

const playerGameTotal =
    team.roster.reduce((total, player) => {
        return total + getPlayerStatTotal(
            player.id,
            "points"
        );
    }, 0) + getUnknownShooterPoints();

          const playerScoringRows =
    team.roster
        .map((player) => {
            const periodCells =
                periodColumns
                    .map((period) => {
                        const playerPeriodStats =
                            liveGameState.playerStatsByPeriod?.[
                                period
                            ]?.[player.id];

                        const points =
                            playerPeriodStats?.points || 0;

                        return `
                            <td>
                                ${points}
                            </td>
                        `;
                    })
                    .join("");

            return `
                <tr>
                    <td class="playerNameCell">
                        ${player.name || "Unnamed"}
                    </td>

                    ${periodCells}

                    <td>
                        ${getPlayerStatTotal(
                            player.id,
                            "points"
                        )}
                    </td>
                </tr>
            `;
        })
        .join("");

        const playerStatTotals = playerStatColumns.map((statKey) => {
    return team.roster.reduce((total, player) => {
        return total + getPlayerStatTotal(
            player.id,
            statKey
        );
    }, 0);
});

          
    document.getElementById(
    "liveSummaryPlayerStats"
).innerHTML = `
    <div class="boxScoreWrap">
        <h3>Player Scoring</h3>

        <table class="boxScoreTable">
            <thead>
                <tr>
                    <th>Player</th>

                    ${periodColumns
                        .map((period) => {
                            return `
                                <th>${period}</th>
                            `;
                        })
                        .join("")}

                    <th>Total</th>
                </tr>
            </thead>

       <tbody>
    ${playerScoringRows}
    ${renderUnknownScoringRow(liveGameState, periodColumns)}

    <tr class="summaryTotalsRow">
        <td>Totals</td>

        ${playerScoringTotals
            .map((total) => {
                return `
                    <td>${total}</td>
                `;
            })
            .join("")}

        <td>${playerGameTotal}</td>
    </tr>
</tbody>
        </table>
    </div>

    <div class="boxScoreWrap">
        <h3>Player Stats</h3>

        <table class="boxScoreTable">
            <thead>
                <tr>
                    <th>#</th>
                    <th>Player</th>
                    ${playerHeaderCells}
                </tr>
            </thead>

            <tbody>
    ${playerRows}

    <tr class="summaryTotalsRow">
        <td></td>
        <td>Totals</td>

        ${playerStatTotals
            .map((total) => {
                return `
                    <td>${total}</td>
                `;
            })
            .join("")}
    </tr>
</tbody>
        </table>
    </div>

    ${renderPlayerShootingSection(liveGameState, team)}
`;

    showLineupPlusMinusCard(
        "liveSummaryLineupCard",
        "liveSummaryLineups",
        liveGameState,
        team,
        null
    );
}

function openGameSummary() {
    const team = getSelectedTeam();

    if (!team || !liveGameState) {
        return;
    }
    const calculatedTeamScore =
    Object.values(
        liveGameState.playerStatsById || {}
    ).reduce((total, playerStats) => {
        return total + (playerStats.points || 0);
    }, 0) + getUnknownShooterPoints();
    viewingSavedGame = false;

    document.getElementById("summaryMatchup").textContent =
        `${team.teamName} vs ${liveGameState.opponent}`;

    const uniqueTeamStats =
        getGameStatKeys(liveGameState, team, "selectedTeamStats");

  const teamStatRows =
    uniqueTeamStats
        .map((statKey) => {
            const stat = teamStats.find(
                (item) => item.key === statKey
            );

            if (!stat) {
                return "";
            }

            return `
                <tr>
                    <td class="teamStatNameCell">
                        ${stat.name}
                    </td>
                    <td>
                        ${getTeamStatTotal(statKey)}
                    </td>
                </tr>
            `;
        })
        .join("");

document.getElementById("summaryTeamStats").innerHTML = `
    <div class="boxScoreWrap">
        <table class="boxScoreTable teamSummaryTable">
            <thead>
                <tr>
                    <th>Stat</th>
                    <th>Total</th>
                </tr>
            </thead>
            <tbody>
                ${teamStatRows}
            </tbody>
        </table>
    </div>
`;
const uniquePlayerStats =
    getGameStatKeys(liveGameState, team, "selectedPlayerStats");
    const playerStatColumns = [
    "points",
    ...uniquePlayerStats.filter(
        (statKey) => isPlayerCounterStat(statKey)
    )
];

const playerHeaderCells =
    playerStatColumns
        .map((statKey) => {
            const stat = playerStats.find(
                (item) => item.key === statKey
            );

            return `
                <th>
                    ${
                        statKey === "points"
                            ? "PTS"
                            : stat?.name || statKey
                    }
                </th>
            `;
        })
        .join("");

const playerRows =
    team.roster
        .map((player) => {
            const statCells =
                playerStatColumns
                    .map((statKey) => {
                        return `
                           <td>
    ${getPlayerStatTotal(
        player.id,
        statKey
    )}
</td>
                        `;
                    })
                    .join("");

            return `
                <tr>
                    <td>
                        ${player.number || "—"}
                    </td>

                    <td class="playerNameCell">
                        ${player.name || "Unnamed"}
                    </td>

                    ${statCells}
                </tr>
            `;
        })
        .join("");

             const playerStatTotals = playerStatColumns.map((statKey) => {
    return team.roster.reduce((total, player) => {
        return total + getPlayerStatTotal(
            player.id,
            statKey
        );
    }, 0);
});

document.getElementById(
    "summaryPlayerStats"
).innerHTML = `
    <div class="boxScoreWrap">
        <table class="boxScoreTable">
            <thead>
                <tr>
                    <th>#</th>
                    <th>Player</th>
                    ${playerHeaderCells}
                </tr>
            </thead>

            <tbody>
    ${playerRows}

    <tr class="summaryTotalsRow">
        <td></td>
        <td>Totals</td>

        ${playerStatTotals
            .map((total) => {
                return `
                    <td>${total}</td>
                `;
            })
            .join("")}
    </tr>
</tbody>
        </table>
    </div>

    ${renderPlayerShootingSection(liveGameState, team)}
`;
document.getElementById(
    "returnToLiveGameButton"
).textContent = "Back to Game";

document.getElementById(
    "saveCompletedGameButton"
).style.display = "";
document.getElementById(
    "summaryTeamScore"
).value = calculatedTeamScore;

// Left empty so the faded "0" placeholder shows and the coach can type the
// score straight away. A typed 0 is still a valid score. When opponent
// scoring was tracked for the whole game, it starts at the tracked total
// (the coach can still change it).
document.getElementById(
    "summaryOpponentScore"
).value =
    getScoringCoverage(liveGameState, "opponentScoring") === "full"
        ? getTrackedOpponentPoints(liveGameState)
        : "";

applySummaryScoreCorrections(team);

// The saved game's ID is fixed now, so a save that was interrupted and
// tried again can never add the same game twice. summaryOpen lets a reload
// come back to this summary.
if (!liveGameState.completedGameId) {
    liveGameState.completedGameId = crypto.randomUUID();
}

liveGameState.summaryOpen = true;
saveLiveGameState();

renderEndOfGameLineups();

    showScreen("gameSummary");
}

// Back to Game from the end-of-game summary. Score corrections are kept
// (see applySummaryScoreCorrections).
function closeGameSummary() {
    if (liveGameState) {
        liveGameState.summaryOpen = false;
        saveLiveGameState();
    }

    showScreen("liveGame");
}

// ---------- Final score corrections on the end-of-game summary ----------
//
// A score typed on the summary is kept in liveGameState.summaryDraft with
// that team's tracked total at the time:
//     { team: { value, tracked, defaultValue },
//       opponent: { ... },
//       review: { team: value, opponent: value } }
// Each team is handled on its own. While its tracked total is unchanged,
// the typed score comes back (after a reload or Back to Game). Once scoring
// for that team is added or undone in the tracker, its score is worked out
// again from the tracker and a note asks the coach to review the earlier
// correction, so a correction is never added on top of new baskets.

// The summary's starting scores, before any correction.
let summaryDefaultScores = { team: "", opponent: "" };

function getSummaryScoreSides(team) {
    return [
        {
            key: "team",
            inputId: "summaryTeamScore",
            label: `${team.teamName}'s`,
            tracked: getRecordedTeamPoints(liveGameState)
        },
        {
            key: "opponent",
            inputId: "summaryOpponentScore",
            label: "the opponent's",
            tracked: getTrackedOpponentPoints(liveGameState)
        }
    ];
}

function applySummaryScoreCorrections(team) {
    const sides = getSummaryScoreSides(team);

    sides.forEach((side) => {
        summaryDefaultScores[side.key] =
            String(document.getElementById(side.inputId).value);
    });

    // Scores typed in an earlier preview kept no tracked totals. Such a draft
    // only exists while its summary is still open, so nothing has been
    // tracked since: keep them with today's totals.
    if (liveGameState.summaryDraft && "opponentScore" in liveGameState.summaryDraft) {
        const typed = liveGameState.summaryDraft;

        liveGameState.summaryDraft = {};

        sides.forEach((side) => {
            liveGameState.summaryDraft[side.key] = {
                value: String(typed[`${side.key}Score`] ?? ""),
                tracked: side.tracked,
                defaultValue: summaryDefaultScores[side.key]
            };
        });
    }

    const draft = liveGameState.summaryDraft;

    if (draft) {
        sides.forEach((side) => {
            const correction = draft[side.key];

            if (!correction) {
                return;
            }

            if (correction.tracked === side.tracked) {
                document.getElementById(side.inputId).value = correction.value;
                return;
            }

            if (correction.value !== correction.defaultValue) {
                draft.review = { ...draft.review, [side.key]: correction.value };
            }

            delete draft[side.key];
        });
    }

    renderSummaryScoreNote(team);
}

function renderSummaryScoreNote(team) {
    const note = document.getElementById("summaryScoreNote");
    const review = liveGameState?.summaryDraft?.review || {};

    const lines = getSummaryScoreSides(team)
        .filter((side) => review[side.key] !== undefined)
        .map((side) => {
            const now = document.getElementById(side.inputId).value;

            return (
                `You had changed ${side.label} score to ${review[side.key]}. ` +
                `Scoring was added or undone in the tracker since then, so it has been ` +
                (now === ""
                    ? "cleared. Please enter the final score."
                    : `recalculated from the tracker (${now}). Please review it before saving.`)
            );
        });

    note.hidden = lines.length === 0;
    note.innerHTML = lines.join("<br>");
}

// A score typed on the summary: kept with that team's tracked total now.
function noteSummaryScoreTyped(sideKey) {
    const team = getSelectedTeam();

    if (!team || !liveGameState) {
        return;
    }

    const side = getSummaryScoreSides(team).find(
        (item) => item.key === sideKey
    );

    if (!liveGameState.summaryDraft) {
        liveGameState.summaryDraft = {};
    }

    const draft = liveGameState.summaryDraft;

    draft[sideKey] = {
        value: document.getElementById(side.inputId).value,
        tracked: side.tracked,
        defaultValue: summaryDefaultScores[sideKey]
    };

    // Typing in that box counts as reviewing it.
    if (draft.review) {
        delete draft.review[sideKey];
    }

    renderSummaryScoreNote(team);
    saveLiveGameState();
}

// A blank final score is never quietly saved as 0. It uses the tracked
// total when that side's scoring was tracked for the whole game, and
// otherwise asks. Returns null if the coach wants to fill it in.
function getFinalScore(inputId, trackedScore, label) {
    const input = document.getElementById(inputId);
    const value = input.value.trim();

    if (value !== "") {
        return Number(value) || 0;
    }

    if (trackedScore !== null) {
        return trackedScore;
    }

    if (confirm(`The ${label} score is blank. Save it as 0?`)) {
        return 0;
    }

    input.focus();
    return null;
}

function openSavedGameSummary(gameId) {
    const game = savedGames.find(
        (savedGame) =>
    String(savedGame.id) === String(gameId)
    );

    const team = teams.find(
        (savedTeam) => savedTeam.id === game?.teamId
    );

    if (!game || !team) {
        return;
    }
    viewingSavedGame = true;
    document.getElementById("summaryScoreNote").hidden = true;

    document.getElementById("summaryMatchup").textContent =
        `${team.teamName} vs ${game.opponent}`;

    document.getElementById("summaryTeamScore").value =
        game.teamScore;

    document.getElementById("summaryOpponentScore").value =
        game.opponentScore;

    const uniqueTeamStats =
        getGameStatKeys(game, team, "selectedTeamStats");

    const periodColumns =
    game.gameFormat === "Halves"
        ? ["1st Half", "2nd Half", "OT"]
        : ["Q1", "Q2", "Q3", "Q4", "OT"];
    const orderedTeamStats = [
    ...uniqueTeamStats.filter(
        (statKey) =>
            statKey !== "fieldGoals" &&
            statKey !== "threePointers" &&
            statKey !== "freeThrows"
    ),
    ...uniqueTeamStats.filter(
        (statKey) =>
            statKey === "fieldGoals" ||
            statKey === "threePointers" ||
            statKey === "freeThrows"
    )
];

const teamStatRows =
    orderedTeamStats
        .map((statKey) => {
            const stat = teamStats.find(
                (item) => item.key === statKey
            );

            if (!stat) {
                return "";
            }

            return `
                <tr>
                    <td class="teamStatNameCell">
                        ${stat.name}
                    </td>

                    ${periodColumns
    .map((period) => {
        const periodValue =
    game.teamStatsByPeriod?.[
        period
    ]?.[statKey] || 0;

const displayPeriodValue =
    statKey === "fieldGoals" ||
statKey === "threePointers" ||
statKey === "freeThrows"
        ? `${periodValue?.made || 0} / ${periodValue?.attempted || 0} - ${
            (periodValue?.attempted || 0) > 0
                ? Math.round(
                    ((periodValue?.made || 0) /
                        periodValue.attempted) *
                        100
                )
                : 0
          }%`
        : periodValue;

return `
    <td>
        ${displayPeriodValue}
    </td>
`;
    })
    .join("")}

<td>
    ${
        statKey === "fieldGoals" ||
statKey === "threePointers" ||
statKey === "freeThrows"    
            ? `${game.teamStats?.[statKey]?.made || 0} / ${
                game.teamStats?.[statKey]?.attempted || 0
              } - ${
                (game.teamStats?.[statKey]?.attempted || 0) > 0
                    ? Math.round(
                        ((game.teamStats?.[statKey]?.made || 0) /
                            game.teamStats[statKey].attempted) *
                            100
                      )
                    : 0
              }%`
            : game.teamStats?.[statKey] || 0
    }
</td>
                </tr>
            `;
        })
        .join("");

document.getElementById(
    "summaryTeamStats"
).innerHTML = `
    <div class="boxScoreWrap">
        <table class="boxScoreTable teamSummaryTable">
            <thead>
    <tr>
        <th>Stat</th>

        ${periodColumns
            .map((period) => {
                return `
                    <th>
                        ${period}
                    </th>
                `;
            })
            .join("")}

        <th>Total</th>
    </tr>
</thead>

            <tbody>
                ${teamStatRows}
            </tbody>
        </table>
    </div>
`;

    const uniquePlayerStats =
        getGameStatKeys(game, team, "selectedPlayerStats");

   const savedPlayerStatColumns = [
    "points",
    ...uniquePlayerStats.filter(
        (statKey) => isPlayerCounterStat(statKey)
    )
];

const savedPlayerHeaderCells =
    savedPlayerStatColumns
        .map((statKey) => {
            const stat = playerStats.find(
                (item) => item.key === statKey
            );

            return `
                <th>
                    ${
                        statKey === "points"
                            ? "PTS"
                            : stat?.name || statKey
                    }
                </th>
            `;
        })
        .join("");

const savedPlayerScoringRows =
    team.roster
        .map((player) => {
            const periodCells =
                periodColumns
                    .map((period) => {
                        const points =
                            game.playerStatsByPeriod?.[
                                period
                            ]?.[player.id]?.points || 0;

                        return `
                            <td>${points}</td>
                        `;
                    })
                    .join("");

            return `
                <tr>
                    <td class="playerNameCell">
                        ${player.name || "Unnamed"}
                    </td>

                    ${periodCells}

                    <td>
                        ${
                            game.playerStatsById?.[
                                player.id
                            ]?.points || 0
                        }
                    </td>
                </tr>
            `;
        })
        .join("");

const savedScoringTotals =
    periodColumns.map((period) => {
        return team.roster.reduce(
            (total, player) => {
                return total + (
                    game.playerStatsByPeriod?.[
                        period
                    ]?.[player.id]?.points || 0
                );
            },
            0
        ) + getUnknownPeriodPoints(game, period);
    });

const savedGamePointsTotal =
    team.roster.reduce((total, player) => {
        return total + (
            game.playerStatsById?.[
                player.id
            ]?.points || 0
        );
    }, 0) + (game.unknownShooterStats?.points || 0);

const savedPlayerRows =
    team.roster
        .map((player) => {
            const statCells =
                savedPlayerStatColumns
                    .map((statKey) => {
                        const total =
                            game.playerStatsById?.[
                                player.id
                            ]?.[statKey] || 0;

                        return `
                            <td>${total}</td>
                        `;
                    })
                    .join("");

            return `
                <tr>
                    <td>
                        ${player.number || "—"}
                    </td>

                    <td class="playerNameCell">
                        ${player.name || "Unnamed"}
                    </td>

                    ${statCells}
                </tr>
            `;
        })
        .join("");

const savedPlayerStatTotals =
    savedPlayerStatColumns.map((statKey) => {
        return team.roster.reduce(
            (total, player) => {
                return total + (
                    game.playerStatsById?.[
                        player.id
                    ]?.[statKey] || 0
                );
            },
            0
        );
    });

document.getElementById(
    "summaryPlayerStats"
).innerHTML = `
    <div class="boxScoreWrap">
        <h3>Player Scoring</h3>

        <table class="boxScoreTable">
            <thead>
                <tr>
                    <th>Player</th>

                    ${periodColumns
                        .map((period) => {
                            return `
                                <th>${period}</th>
                            `;
                        })
                        .join("")}

                    <th>Total</th>
                </tr>
            </thead>

            <tbody>
                ${savedPlayerScoringRows}
                ${renderUnknownScoringRow(game, periodColumns)}

                <tr class="summaryTotalsRow">
                    <td>Totals</td>

                    ${savedScoringTotals
                        .map((total) => {
                            return `
                                <td>${total}</td>
                            `;
                        })
                        .join("")}

                    <td>${savedGamePointsTotal}</td>
                </tr>
            </tbody>
        </table>
    </div>

    <div class="boxScoreWrap">
        <h3>Player Stats</h3>

        <table class="boxScoreTable">
            <thead>
                <tr>
                    <th>#</th>
                    <th>Player</th>
                    ${savedPlayerHeaderCells}
                </tr>
            </thead>

            <tbody>
                ${savedPlayerRows}

                <tr class="summaryTotalsRow">
                    <td></td>
                    <td>Totals</td>

                    ${savedPlayerStatTotals
                        .map((total) => {
                            return `
                                <td>${total}</td>
                            `;
                        })
                        .join("")}
                </tr>
            </tbody>
        </table>
    </div>

    ${renderPlayerShootingSection(game, team)}
`;
document.getElementById(
    "returnToLiveGameButton"
).textContent = "Back to Team";

document.getElementById(
    "saveCompletedGameButton"
).style.display = "none";

showLineupPlusMinusCard(
    "summaryLineupCard",
    "summaryLineups",
    game,
    team,
    {
        team: Number(game.teamScore) || 0,
        opponent: Number(game.opponentScore) || 0
    }
);
    showScreen("gameSummary");
}
function saveCompletedGame() {
    const team = getSelectedTeam();

    if (!team || !liveGameState) {
        return;
    }

    // Another Court94 tab or window changed this game since this page last
    // saved it: show the newest version instead of saving an older one.
    if (isSavedGameChangedElsewhere()) {
        showNewestSavedGame();
        return;
    }

    // Start from the saved games as they are now, which may include games
    // saved in another tab since this page opened.
    const storedGames = readSavedGamesIfReadable();

    if (storedGames) {
        savedGames = storedGames;
    }

    const gameId = liveGameState.completedGameId || crypto.randomUUID();

    // Already saved (a save that finished just before the app was closed):
    // never add it a second time.
    if (savedGames.some((game) => game.id === gameId)) {
        finishSavedGame(team);
        return;
    }

    const teamScore = getFinalScore(
        "summaryTeamScore",
        getScoringCoverage(liveGameState, "points") === "full"
            ? getRecordedTeamPoints(liveGameState)
            : null,
        `${team.teamName}`
    );

    if (teamScore === null) {
        return;
    }

    const opponentScore = getFinalScore(
        "summaryOpponentScore",
        getScoringCoverage(liveGameState, "opponentScoring") === "full"
            ? getTrackedOpponentPoints(liveGameState)
            : null,
        "opponent's"
    );

    if (opponentScore === null) {
        return;
    }

    const completedGame = {
    id: gameId,
    teamId: team.id,
    season: team.season,
    opponent: liveGameState.opponent,
        gameDate: liveGameState.gameDate,
        gameType: liveGameState.gameType,
        location: liveGameState.location,
        gameFormat: liveGameState.gameFormat,
        gameStarters: liveGameState.gameStarters,
        teamScore,
        opponentScore,
        teamStats: liveGameState.teamStats,

selectedTeamStats:
    liveGameState.selectedTeamStats,

selectedPlayerStats:
    liveGameState.selectedPlayerStats,

playerStatsById:
    liveGameState.playerStatsById,

teamStatsByPeriod:
    liveGameState.teamStatsByPeriod,

playerStatsByPeriod:
    liveGameState.playerStatsByPeriod,

unknownShooterStats:
    liveGameState.unknownShooterStats || {},

unknownShooterStatsByPeriod:
    liveGameState.unknownShooterStatsByPeriod || {},

shootingCoverage:
    getShootingCoverage(liveGameState),

subbedInPlayerIds:
    getFinalSubbedInPlayerIds(liveGameState),

participationTracked:
    Boolean(liveGameState.participationTracked),

// Lineup plus/minus data, only for games that used Opponent Scoring.
...(getScoringCoverage(liveGameState, "opponentScoring") !== "none"
    ? {
          scoringLog: liveGameState.scoringLog || {
              lineups: [],
              events: [],
              nextEventId: 1
          },
          scoringTracking: liveGameState.scoringTracking
      }
    : {}),
        completedAt: new Date().toISOString()
    };

    // Save, then read it back. Only a confirmed save clears the game in
    // progress; if saving fails, the game stays here and nothing is lost.
    const updatedGames = [...savedGames, completedGame];
    const updatedGamesText = JSON.stringify(updatedGames);

    try {
        localStorage.setItem(GAMES_STORAGE_KEY, updatedGamesText);

        if (localStorage.getItem(GAMES_STORAGE_KEY) !== updatedGamesText) {
            throw new Error("Saved games didn't read back correctly.");
        }
    } catch (error) {
        console.error("Court94 could not save the game:", error);

        alert(
            "Court94 couldn't save this game, so it is still here and nothing was lost.\n\n" +
            "Please try Save Game again. If it keeps failing, go to Settings and download a backup, which includes this game in progress."
        );

        return;
    }

    savedGames = updatedGames;
    finishSavedGame(team);
}

// After a confirmed save: clear the game in progress (in memory and its
// on-device copy) and go to the team.
function finishSavedGame(team) {
    liveGameState = null;
    currentGameSetup = null;
    liveActionHistory = [];
    selectedLivePlayerId = null;

    saveLiveGameState();
    openTeamDetails(team.id);

    // Saved games are what fill storage, so check the space left now
    // (storage.js), never during a game.
    if (typeof checkStorageAfterGameSaved === "function") {
        checkStorageAfterGameSaved();
    }
}
function renderLastAction() {
    const lastActionText =
        document.getElementById(
            "lastActionText"
        );

    const undoButton =
        document.getElementById(
            "undoLastActionButton"
        );

    if (liveActionHistory.length === 0) {
        lastActionText.textContent =
            "No stats recorded yet.";

        undoButton.disabled = true;
        return;
    }

    const lastAction =
        liveActionHistory[
            liveActionHistory.length - 1
        ];

    lastActionText.textContent =
        lastAction.description;

    undoButton.disabled = false;
}
function undoLastPlayerAction(playerId) {
    for (
        let index = liveActionHistory.length - 1;
        index >= 0;
        index--
    ) {
        const action = liveActionHistory[index];

        const isPlayerAction =
            action.playerId === playerId &&
            (
                action.type === "playerPoints" ||
                action.type === "playerStat" ||
                action.type === "playerMiss"
            );

        if (!isPlayerAction) {
            continue;
        }

        if (
            action.type === "playerMiss" ||
            (
                action.type === "playerPoints" &&
                action.shotCountersRecorded
            )
        ) {
            // Reverses exactly what applyPlayerShot recorded: the player's
            // points and shooting counters plus the linked team totals.
            applyPlayerShot(
                playerId,
                action.shotType,
                action.type === "playerPoints",
                -1,
                action.period || liveGameState.period
            );
        } else {
        // Entries recorded before player shooting counters existed
        // (e.g. a game in progress during the update) use the original Undo.

        if (action.type === "playerPoints") {
            const playerState =
                liveGameState.playerStatsById[playerId];

            playerState.points = Math.max(
                0,
                (playerState.points || 0) - action.amount
            );

            const actionPeriod =
    action.period || liveGameState.period;

const periodPlayerState =
    liveGameState.playerStatsByPeriod?.[
        actionPeriod
    ]?.[playerId];

if (periodPlayerState) {
    periodPlayerState.points =
        Math.max(
            0,
            (periodPlayerState.points || 0) -
                action.amount
        );
}
        }

        if (action.type === "playerPoints" && action.amount === 1) {
    const freeThrows =
        liveGameState.teamStats.freeThrows;

    if (freeThrows && typeof freeThrows === "object") {
        freeThrows.attempted =
            Math.max(0, (freeThrows.attempted || 0) - 1);

        freeThrows.made =
            Math.max(0, (freeThrows.made || 0) - 1);
    }

    const periodFreeThrows =
        liveGameState.teamStatsByPeriod?.[
            action.period || liveGameState.period
        ]?.freeThrows;

    if (
        periodFreeThrows &&
        typeof periodFreeThrows === "object"
    ) {
        periodFreeThrows.attempted =
            Math.max(
                0,
                (periodFreeThrows.attempted || 0) - 1
            );

        periodFreeThrows.made =
            Math.max(
                0,
                (periodFreeThrows.made || 0) - 1
            );
    }
}

// Undo linked Team 3-Point Field Goal for Player +3

// Also undo the regular Field Goal for the made 3-pointer
if (
    action.type === "playerPoints" &&
    action.linkedTeamStat === "threePointers"
) {
    const fieldGoals =
        liveGameState.teamStats.fieldGoals;

    if (
        fieldGoals &&
        typeof fieldGoals === "object"
    ) {
        fieldGoals.attempted = Math.max(
            0,
            (fieldGoals.attempted || 0) - 1
        );

        fieldGoals.made = Math.max(
            0,
            (fieldGoals.made || 0) - 1
        );
    }

    const periodFieldGoals =
        liveGameState.teamStatsByPeriod?.[
            action.period || liveGameState.period
        ]?.fieldGoals;

    if (
        periodFieldGoals &&
        typeof periodFieldGoals === "object"
    ) {
        periodFieldGoals.attempted = Math.max(
            0,
            (periodFieldGoals.attempted || 0) - 1
        );

        periodFieldGoals.made = Math.max(
            0,
            (periodFieldGoals.made || 0) - 1
        );
    }
}
if (
    action.type === "playerPoints" &&
    action.linkedTeamStat === "threePointers"
) {
    const threePointers =
        liveGameState.teamStats.threePointers;

    if (
        threePointers &&
        typeof threePointers === "object"
    ) {
        threePointers.attempted = Math.max(
            0,
            (threePointers.attempted || 0) - 1
        );

        threePointers.made = Math.max(
            0,
            (threePointers.made || 0) - 1
        );
    }

    const periodThreePointers =
        liveGameState.teamStatsByPeriod?.[
            action.period || liveGameState.period
        ]?.threePointers;

    if (
        periodThreePointers &&
        typeof periodThreePointers === "object"
    ) {
        periodThreePointers.attempted = Math.max(
            0,
            (periodThreePointers.attempted || 0) - 1
        );

        periodThreePointers.made = Math.max(
            0,
            (periodThreePointers.made || 0) - 1
        );
    }
}

// Undo linked Team Field Goal for Player +2
if (
    action.type === "playerPoints" &&
    action.linkedTeamStat === "fieldGoals"
) {
    const fieldGoals =
        liveGameState.teamStats.fieldGoals;

    if (
        fieldGoals &&
        typeof fieldGoals === "object"
    ) {
        fieldGoals.attempted = Math.max(
            0,
            (fieldGoals.attempted || 0) - 1
        );

        fieldGoals.made = Math.max(
            0,
            (fieldGoals.made || 0) - 1
        );
    }

    const periodFieldGoals =
        liveGameState.teamStatsByPeriod?.[
            action.period || liveGameState.period
        ]?.fieldGoals;

    if (
        periodFieldGoals &&
        typeof periodFieldGoals === "object"
    ) {
        periodFieldGoals.attempted = Math.max(
            0,
            (periodFieldGoals.attempted || 0) - 1
        );

        periodFieldGoals.made = Math.max(
            0,
            (periodFieldGoals.made || 0) - 1
        );
    }
}

        if (action.type === "playerStat") {
            const playerState =
                liveGameState.playerStatsById[playerId];

            playerState[action.statKey] = Math.max(
                0,
                (playerState[action.statKey] || 0) - 1
            );

            const actionPeriod =
    action.period || liveGameState.period;

const periodPlayerState =
    liveGameState.playerStatsByPeriod?.[
        actionPeriod
    ]?.[playerId];

if (periodPlayerState) {
    periodPlayerState[action.statKey] =
        Math.max(
            0,
            (
                periodPlayerState[
                    action.statKey
                ] || 0
            ) - 1
        );
}
        }
        if (action.statKey === "defensiveRebounds") {
    liveGameState.teamStats.defensiveRebounds =
        Math.max(
            0,
            (liveGameState.teamStats.defensiveRebounds || 0) - 1
        );

    const linkedPeriod =
    action.period || liveGameState.period;

const periodTeamStats =
    liveGameState.teamStatsByPeriod?.[linkedPeriod];

    if (periodTeamStats) {
        periodTeamStats.defensiveRebounds =
            Math.max(
                0,
                (periodTeamStats.defensiveRebounds || 0) - 1
            );
    }
}

if (action.statKey === "offensiveRebounds") {
    liveGameState.teamStats.offensiveRebounds =
        Math.max(
            0,
            (liveGameState.teamStats.offensiveRebounds || 0) - 1
        );

    const linkedPeriod =
        action.period || liveGameState.period;

    const periodTeamStats =
        liveGameState.teamStatsByPeriod?.[linkedPeriod];

    if (periodTeamStats) {
        periodTeamStats.offensiveRebounds =
            Math.max(
                0,
                (periodTeamStats.offensiveRebounds || 0) - 1
            );
    }
}

if (action.statKey === "turnovers") {
    liveGameState.teamStats.turnovers =
        Math.max(
            0,
            (liveGameState.teamStats.turnovers || 0) - 1
        );

    const linkedPeriod =
        action.period || liveGameState.period;

    const periodTeamStats =
        liveGameState.teamStatsByPeriod?.[linkedPeriod];

    if (periodTeamStats) {
        periodTeamStats.turnovers =
            Math.max(
                0,
                (periodTeamStats.turnovers || 0) - 1
            );
    }
}
        }

        removeScoringLogEvent(action.scoringEventId);
        liveActionHistory.splice(index, 1);

        renderPlayerBench();
        connectPlayerCardButtons();
        renderLastAction();
renderTeamStatButtons();
updateLiveTeamPointTotal();

        saveLiveGameState();

        return;
    }
}
function undoLastAction() {
    const lastAction =
        liveActionHistory.pop();

    // Only for baskets this Undo actually takes back, so the lineup log
    // always matches the score.
    if (
        lastAction?.type === "playerPoints" ||
        lastAction?.type === "opponentPoints"
    ) {
        removeScoringLogEvent(lastAction.scoringEventId);
    }
        console.log("UNDO ACTION:", lastAction);

    if (!lastAction) {
        return;
    }

    if (lastAction.type === "playerPoints") {
        const playerState =
            liveGameState.playerStatsById[
                lastAction.playerId
            ];

            const actionPeriod =
    lastAction.period || liveGameState.period;

const periodPlayerState =
    liveGameState.playerStatsByPeriod?.[
        actionPeriod
    ]?.[lastAction.playerId];

if (periodPlayerState) {
    periodPlayerState.points =
        Math.max(
            0,
            (periodPlayerState.points || 0) -
                lastAction.amount
        );
}

        playerState.points = Math.max(
            0,
            (playerState.points || 0) -
                lastAction.amount
        );
      // Undo linked Team Field Goal for Player +2
if (lastAction.linkedTeamStat === "fieldGoals") {
    const teamFG = liveGameState.teamStats.fieldGoals;

    if (teamFG && typeof teamFG === "object") {
        teamFG.made = Math.max(0, (teamFG.made || 0) - 1);
        teamFG.attempted = Math.max(0, (teamFG.attempted || 0) - 1);
    }

    const periodFG =
        liveGameState.teamStatsByPeriod?.[actionPeriod]?.fieldGoals;

    if (periodFG && typeof periodFG === "object") {
        periodFG.made = Math.max(0, (periodFG.made || 0) - 1);
        periodFG.attempted = Math.max(
            0,
            (periodFG.attempted || 0) - 1
        );
    }
}
    }

    if (lastAction.type === "playerStat") {
        const playerState =
            liveGameState.playerStatsById[
                lastAction.playerId
            ];

        playerState[lastAction.statKey] =
            Math.max(
                0,
                (playerState[
                    lastAction.statKey
                ] || 0) - 1
            );

            const actionPeriod =
    lastAction.period || liveGameState.period;

const periodPlayerState =
    liveGameState.playerStatsByPeriod?.[
        actionPeriod
    ]?.[lastAction.playerId];

if (periodPlayerState) {
    periodPlayerState[lastAction.statKey] =
        Math.max(
            0,
            (
                periodPlayerState[
                    lastAction.statKey
                ] || 0
            ) - 1
        );
}
    }
    if (lastAction.statKey === "defensiveRebounds") {
    liveGameState.teamStats.defensiveRebounds =
        Math.max(
            0,
            (liveGameState.teamStats.defensiveRebounds || 0) - 1
        );

    const periodTeamStats =
        liveGameState.teamStatsByPeriod?.[actionPeriod];

    if (periodTeamStats) {
        periodTeamStats.defensiveRebounds =
            Math.max(
                0,
                (periodTeamStats.defensiveRebounds || 0) - 1
            );
    }
}
if (lastAction.type === "transitionPoints") {
    liveGameState.teamStats.transitionPoints =
        Math.max(
            0,
            (
                liveGameState.teamStats
                    .transitionPoints || 0
            ) - lastAction.amount
        );
}
    if (lastAction.type === "teamStat") {
        liveGameState.teamStats[
            lastAction.statKey
        ] =
            Math.max(
                0,
                (
                    liveGameState.teamStats[
                        lastAction.statKey
                    ] || 0
                ) - 1
            );

            const actionPeriod =
    lastAction.period || liveGameState.period;

if (
    liveGameState.teamStatsByPeriod?.[
        actionPeriod
    ]
) {
    liveGameState.teamStatsByPeriod[
        actionPeriod
    ][lastAction.statKey] =
        Math.max(
            0,
            (
                liveGameState.teamStatsByPeriod[
                    actionPeriod
                ][lastAction.statKey] || 0
            ) - Math.abs(lastAction.amount || 1)
        );
}
    }

    renderPlayerStatButtons();
    renderTeamStatButtons();
    renderLastAction();
    renderOpponentScoring();
}
function openNewGameScreen() {
    const team = getSelectedTeam();

    if (!team) {
        alert("Please select a team first.");
        return;
    }

    // An unfinished game is never replaced without the coach choosing to.
    if (liveGameState && !replaceUnfinishedGameApproved) {
        if (!confirmReplaceUnfinishedGame()) {
            return;
        }

        replaceUnfinishedGameApproved = true;
    }

    document.getElementById("newGameForm").reset();

    document.querySelector(
        'input[name="gameType"][value="Regular Season"]'
    ).checked = true;

    document.querySelector(
        'input[name="gameLocation"][value="Home"]'
    ).checked = true;

    const today = new Date();

    const localDate = new Date(
        today.getTime() -
        today.getTimezoneOffset() * 60000
    )
        .toISOString()
        .split("T")[0];

    document.getElementById("gameDateInput").value =
        localDate;

    showScreen("newGame");
}

function createGameConfirmation(event) {
    event.preventDefault();

    const team = getSelectedTeam();

    if (!team) {
        return;
    }

    const opponent =
        document
            .getElementById("opponentInput")
            .value
            .trim();

    if (!opponent) {
        alert("Please enter an opponent.");
        return;
    }

    const gameType =
        document.querySelector(
            'input[name="gameType"]:checked'
        ).value;

    const location =
        document.querySelector(
            'input[name="gameLocation"]:checked'
        ).value;


        const gameFormat =
    document.querySelector(
        'input[name="gameFormat"]:checked'
    ).value;
    const gameDate =
        document.getElementById("gameDateInput").value;

    currentGameSetup = {
        teamId: team.id,
        opponent,
        gameType,
        location,
        gameFormat,
        gameDate
    };

    const fullTeamName = [
        team.schoolName,
        team.teamName
    ]
        .filter(Boolean)
        .join(" — ");

    document.getElementById(
        "confirmationTeamName"
    ).textContent = fullTeamName || team.teamName;

    document.getElementById(
        "confirmationOpponent"
    ).textContent = opponent;

    document.getElementById(
        "confirmationGameDetails"
    ).textContent =
        `${gameDate} · ${gameType} · ${location} · ${gameFormat}`;

   const uniqueTeamStats = [
    ...new Set(team.selectedTeamStats || [])
];

const uniquePlayerStats = [
    ...new Set(team.selectedPlayerStats || [])
];

const combinedStats = [
    ...uniqueTeamStats.map((statKey) => {
        return getTeamStatChoices().find(
            (stat) => stat.key === statKey
        );
    }),

    ...uniquePlayerStats.map((statKey) => {
        return playerStats.find(
            (stat) => stat.key === statKey
        );
    })
]
    .filter(Boolean);

    renderGameStarterChoices(
        team,
        editingLiveGameSetup
            ? liveGameState.gameStarters || []
            : team.roster
                  .filter((player) => player.keepAtTop)
                  .map((player) => player.id)
    );

editingLiveGameSetup = false;

document.getElementById(
    "backToGameSetupButton"
).style.display = "";

document.getElementById(
    "confirmStartGameButton"
).textContent = "START GAME";

    renderGameStatChoices(team);

    showScreen("gameConfirmation");
}

// The "Starting 5 for This Game" checkboxes, with the given players ticked.
// Used for a new game and every time Edit Game Setup opens, so the list is
// never empty (e.g. after a page reload or Backup & Restore).
function renderGameStarterChoices(team, checkedPlayerIds) {
    const gameStartersList =
        document.getElementById("gameStartersList");

    gameStartersList.innerHTML = team.roster
        .map((player) => {
            return `
            <label class="gameStarterOption">
                <input
                    type="checkbox"
                    class="gameStarterCheckbox"
                    data-player-id="${player.id}"
                    ${checkedPlayerIds.includes(player.id) ? "checked" : ""}
                >
                <span>
                    #${player.number} ${player.name}
                </span>
            </label>
        `;
        })
        .join("");

    const starterCheckboxes =
        document.querySelectorAll(".gameStarterCheckbox");

    function updateStarterCheckboxes() {
        const checkedCount =
            document.querySelectorAll(
                ".gameStarterCheckbox:checked"
            ).length;

        starterCheckboxes.forEach((checkbox) => {
            checkbox.disabled =
                checkedCount >= 5 && !checkbox.checked;
        });
    }

    starterCheckboxes.forEach((checkbox) => {
        checkbox.addEventListener("change", () => {
            updateStarterCheckboxes();
        });
    });

    updateStarterCheckboxes();
}

// Opens Edit Game Setup for the game in progress, filled in from the game
// itself (matchup, stats and the game's existing starters).
function openLiveGameSetupEditor() {
    const team = getSelectedTeam();

    if (!team || !liveGameState) {
        return;
    }

    editingLiveGameSetup = true;

    document.getElementById(
        "backToGameSetupButton"
    ).style.display = "none";

    document.getElementById(
        "confirmStartGameButton"
    ).textContent = "CONTINUE GAME";

    currentGameSetup = {
        ...liveGameState
    };

    document.getElementById("confirmationTeamName").textContent =
        [team.schoolName, team.teamName].filter(Boolean).join(" — ") ||
        team.teamName;

    document.getElementById("confirmationOpponent").textContent =
        liveGameState.opponent;

    document.getElementById("confirmationGameDetails").textContent =
        `${liveGameState.gameDate} · ${liveGameState.gameType} · ${liveGameState.location} · ${liveGameState.gameFormat}`;

    renderGameStatChoices(
        team,
        liveGameState.selectedTeamStats,
        liveGameState.selectedPlayerStats
    );

    renderGameStarterChoices(
        team,
        liveGameState.gameStarters || []
    );

    showScreen("gameConfirmation");
}

function openTeamDetails(teamId) {
    const team = teams.find(
        (savedTeam) => savedTeam.id === teamId
    );

    if (!team) {
        return;
    }

    selectedTeamId = teamId;
    updateAppTeamBadge();

    const fullName = [
        team.schoolName,
        team.teamName
    ]
        .filter(Boolean)
        .join(" — ");

    document.getElementById("detailsTeamName").textContent =
        fullName || team.teamName;

    document.getElementById("detailsTeamInformation").textContent =
        `${team.season || "Season not entered"} · ${team.roster.length} players`;

    const detailsRoster =
        document.getElementById("detailsRoster");

    detailsRoster.innerHTML = team.roster
        .map((player) => {
            return `
                <div class="detailsPlayer">
                    <span class="detailsPlayerNumber">
                        ${player.number || "—"}
                    </span>

                    <span class="detailsPlayerName">
                        ${player.name || "Unnamed Player"}
                    </span>
                </div>
            `;
        })
        .join("");

    const detailsTeamStats =
        document.getElementById("detailsTeamStats");

    detailsTeamStats.innerHTML = team.selectedTeamStats
        .map((statKey) => {
            const stat = getTeamStatChoices().find(
                (item) => item.key === statKey
            );

            if (!stat) {
                return "";
            }

            return `
                <div class="detailsStat">
                    <strong>${stat.name}</strong>
                    <small>${stat.description}</small>
                </div>
            `;
        })
        .join("");

    const detailsPlayerStats =
        document.getElementById("detailsPlayerStats");

    detailsPlayerStats.innerHTML = team.selectedPlayerStats
        .map((statKey) => {
            const stat = playerStats.find(
                (item) => item.key === statKey
            );

            if (!stat) {
                return "";
            }

            return `
                <div class="detailsStat">
                    <strong>${stat.name}</strong>
                    <small>${stat.description}</small>
                </div>
            `;
        })
        .join("");
const teamGames = savedGames
    .filter((game) => game.teamId === team.id)
    .sort((a, b) => {
        return new Date(b.completedAt) - new Date(a.completedAt);
    });

const pastGamesList =
    document.getElementById("pastGamesList");

if (teamGames.length === 0) {
    pastGamesList.innerHTML = `
        <div class="emptyState">
            <h3>No saved games yet</h3>
            <p>
                Completed games will appear here after you save them.
            </p>
        </div>
    `;
} else {
    pastGamesList.innerHTML = teamGames
        .map((game) => {
            let resultLetter = "T";
            let resultClass = "gameResultTie";

            if (game.teamScore > game.opponentScore) {
                resultLetter = "W";
                resultClass = "gameResultWin";
            }

            if (game.teamScore < game.opponentScore) {
                resultLetter = "L";
                resultClass = "gameResultLoss";
            }

            return `
                <div class="pastGameCard">

                    <div class="pastGameInfo">

                        <h4>
                            <span
                                class="gameResultBadge ${resultClass}"
                            >
                                ${resultLetter}
                            </span>

                            vs ${game.opponent}
                        </h4>

                        <p>
                            ${game.gameDate || "Date not entered"}
                            · ${game.teamScore}-${game.opponentScore}
                        </p>

                    </div>

                    <button
                        class="viewGameButton"
                        type="button"
                        data-view-game="${game.id}"
                    >
                        View Game
                    </button>

                </div>
            `;
        })
        .join("");
        document
    .querySelectorAll("[data-view-game]")
    .forEach((button) => {
        button.addEventListener("click", () => {
            openSavedGameSummary(
                button.dataset.viewGame
            );
        });
    });
}
    showScreen("teamDetails");
}
function renderTeams() {
    if (teams.length === 0) {
        teamsList.innerHTML = `
            <div class="emptyState">
                <h3>No teams yet</h3>

                <p>
                    Add your first team to begin building
                    a roster and choosing statistics.
                </p>
            </div>
        `;

        return;
    }

    teamsList.innerHTML = [...teams]
    .reverse()
    .map((team) => {
            const fullName = [
                team.schoolName,
                team.teamName
            ]
                .filter(Boolean)
                .join(" — ");

            return `
                <article
    class="teamCard"
    data-open-team="${team.id}"
>

                    <div>
                        <h3>${fullName || team.teamName}</h3>

                        <p>
                            ${team.season || "Season not entered"}
                            · ${team.roster.length} players
                        </p>
                    </div>

                    <div class="teamCardActions">

                        <button
                            class="smallButton"
                            type="button"
                            data-edit-team="${team.id}"
                        >
                            Edit
                        </button>

                        <button
                            class="smallButton deleteButton"
                            type="button"
                            data-delete-team="${team.id}"
                        >
                            Delete
                        </button>

                    </div>

                </article>
            `;
        })
        .join("");
document
    .querySelectorAll("[data-open-team]")
    .forEach((card) => {
        card.addEventListener("click", (event) => {
            if (event.target.closest("button")) {
                return;
            }

            openTeamDetails(card.dataset.openTeam);
        });
    });
    document
        .querySelectorAll("[data-edit-team]")
        .forEach((button) => {
            button.addEventListener("click", () => {
                openEditTeamForm(button.dataset.editTeam);
            });
        });

    document
        .querySelectorAll("[data-delete-team]")
        .forEach((button) => {
            button.addEventListener("click", () => {
                deleteTeam(button.dataset.deleteTeam);
            });
        });
}

function deleteTeam(teamId) {
    const team = teams.find(
        (savedTeam) => savedTeam.id === teamId
    );

    if (!team) {
        return;
    }

    const confirmed = confirm(
        `Delete ${team.teamName}? This cannot be undone.`
    );

    if (!confirmed) {
        return;
    }

    const previousTeams = teams;

    teams = teams.filter(
        (savedTeam) => savedTeam.id !== teamId
    );

    if (!saveTeams()) {
        teams = previousTeams;

        alert(
            `Court94 couldn't delete ${team.teamName}, so it is still here and nothing was changed.\n\n` +
            TEAM_SAVE_FAILED_MESSAGE
        );

        return;
    }

    renderTeams();
}

function renderGamesTeamFilter() {
    const gamesTeamCards =
        document.getElementById("gamesTeamCards");

    if (!gamesTeamCards) {
        return;
    }

    if (teams.length === 0) {
        gamesTeamCards.innerHTML = `
            <div class="emptyState">
                <h3>No teams yet</h3>
                <p>Create a team to start tracking games.</p>
            </div>
        `;

        gamesTeamCards.dataset.selectedTeamId = "";
        return;
    }

    let selectedGamesTeamId =
        gamesTeamCards.dataset.selectedTeamId;

    const selectedTeamStillExists =
        teams.some(
            (team) =>
                team.id === selectedGamesTeamId
        );

    if (!selectedTeamStillExists) {
        selectedGamesTeamId =
            teams.some(
                (team) =>
                    team.id === selectedTeamId
            )
                ? selectedTeamId
                : teams[0].id;

        gamesTeamCards.dataset.selectedTeamId =
            selectedGamesTeamId;
    }

    gamesTeamCards.innerHTML = [...teams]
    .reverse()
    .map((team) => {
            const teamLabel = [
                team.schoolName,
                team.teamName
            ]
                .filter(Boolean)
                .join(" — ");

            const isSelected =
                team.id === selectedGamesTeamId;

            return `
                <button
                    type="button"
                    class="gamesTeamCard ${
                        isSelected
                            ? "activeGamesTeamCard"
                            : ""
                    }"
                    data-games-team-id="${team.id}"
                >
                    <span class="gamesTeamCardName">
                        ${teamLabel || "Team"}
                    </span>

                    ${
                        team.season
                            ? `
                                <span class="gamesTeamCardSeason">
                                    ${team.season}
                                </span>
                            `
                            : ""
                    }
                </button>
            `;
        })
        .join("");

    gamesTeamCards
        .querySelectorAll(
            "[data-games-team-id]"
        )
        .forEach((button) => {
            button.addEventListener(
                "click",
                () => {
                    gamesTeamCards.dataset.selectedTeamId =
                        button.dataset.gamesTeamId;

                    selectedTeamId =
                        button.dataset.gamesTeamId;
                        updateAppTeamBadge();

                    renderGamesTeamFilter();
                    renderGamesList();
                }
            );
        });
}


function renderGamesList() {
    const gamesList =
    document.getElementById("gamesList");

const gamesTeamCards =
    document.getElementById("gamesTeamCards");

if (!gamesList || !gamesTeamCards) {
    return;
}

const selectedFilterTeamId =
    gamesTeamCards.dataset.selectedTeamId;

if (!selectedFilterTeamId) {
    gamesList.innerHTML = `
        <div class="emptyState">
            <h3>Select a team</h3>
            <p>Choose a team above to view its past games.</p>
        </div>
    `;

    return;
}

    const filteredGames =
        savedGames
            .filter((game) => {
                return (
                    selectedFilterTeamId === "all" ||
                    game.teamId === selectedFilterTeamId
                );
            })
            .sort((a, b) => {
                return (
                    new Date(b.completedAt) -
                    new Date(a.completedAt)
                );
            });

    if (filteredGames.length === 0) {
        gamesList.innerHTML = `
            <div class="emptyState">
                <h3>No games yet</h3>
                <p>
                    Your completed games will appear here.
                </p>
            </div>
        `;

        return;
    }

    gamesList.innerHTML =
        filteredGames
            .map((game) => {
                const team =
                    teams.find(
                        (item) =>
                            item.id === game.teamId
                    );

                const teamLabel = [
                    team?.schoolName,
                    team?.teamName
                ]
                    .filter(Boolean)
                    .join(" — ");

                let resultLetter = "T";
                let resultClass = "gameResultTie";

                if (
                    game.teamScore >
                    game.opponentScore
                ) {
                    resultLetter = "W";
                    resultClass = "gameResultWin";
                }

                if (
                    game.teamScore <
                    game.opponentScore
                ) {
                    resultLetter = "L";
                    resultClass = "gameResultLoss";
                }

                return `
                    <div class="pastGameCard">
                        <div class="pastGameInfo">
                            <h4>
                                <span
                                    class="gameResultBadge ${resultClass}"
                                >
                                    ${resultLetter}
                                </span>

                                ${teamLabel || "Team"}
                                vs ${game.opponent}
                            </h4>

                            <p>
                                ${
                                    game.gameDate ||
                                    "Date not entered"
                                }
                                ·
                                ${game.teamScore}-${game.opponentScore}
                            </p>
                        </div>

                        <button
                            class="viewGameButton"
                            type="button"
                            data-games-view-game="${game.id}"
                        >
                            View Game
                        </button>
                    </div>
                `;
            })
            .join("");

    document
        .querySelectorAll(
            "[data-games-view-game]"
        )
        .forEach((button) => {
            button.addEventListener(
                "click",
                () => {
                    const game =
                        savedGames.find(
                            (item) =>
                                item.id ===
                                button.dataset.gamesViewGame
                        );

                    if (game) {
                        selectedTeamId =
                            game.teamId;
                    }

                    openSavedGameSummary(
                        button.dataset.gamesViewGame
                    );
                }
            );
        });
}

document
    .getElementById("teamsBtn")
    .addEventListener("click", () => {
        renderTeams();
        showScreen("teams");
    });

document
    .getElementById("gamesBtn")
    .addEventListener("click", () => {
        renderGamesTeamFilter();
        renderGamesList();
        showScreen("games");
    });

    document
    .getElementById("startNewGameButton")
    .addEventListener("click", () => {
        const gamesTeamCards =
            document.getElementById("gamesTeamCards");

        const selectedGamesTeamId =
            gamesTeamCards?.dataset.selectedTeamId;

        if (!selectedGamesTeamId) {
            alert("Please select a team before starting a game.");
            return;
        }

        selectedTeamId = selectedGamesTeamId;
        updateAppTeamBadge();

        // Same fresh form as starting from the team page: blank opponent,
        // today's date (not the previous game's).
        openNewGameScreen();
    });

    function renderReportsTeamFilter() {
    const reportsTeamCards =
        document.getElementById("reportsTeamCards");

    if (!reportsTeamCards) {
        return;
    }

    if (teams.length === 0) {
        reportsTeamCards.innerHTML = `
            <div class="emptyState">
                <h3>No teams yet</h3>
                <p>Create a team to view reports.</p>
            </div>
        `;
        return;
    }

    reportsTeamCards.innerHTML = [...teams]
    .reverse()
    .map((team) => {
            const teamLabel = [
                team.schoolName,
                team.teamName
            ]
                .filter(Boolean)
                .join(" — ");

            return `
                <button
                    type="button"
                    class="reportsTeamCard"
                    data-reports-team-id="${team.id}"
                >
                    ${teamLabel}
                </button>
            `;
        })
        .join("");
}

function renderReportsSeasonFilter() {
    const reportsTeamCards =
    document.getElementById("reportsTeamCards");

    const reportsSeasonFilter =
        document.getElementById("reportsSeasonFilter");

    if (!reportsTeamCards || !reportsSeasonFilter) {
        return;
    }

    const teamId =
    reportsTeamCards.dataset.selectedTeamId || "";

    reportsSeasonFilter.innerHTML = `
        <option value="">Select Season</option>
    `;

    if (!teamId) {
        return;
    }

    const team =
        teams.find(
            (item) => item.id === teamId
        );

    if (!team) {
        return;
    }

    const seasons = new Set();

    if (team.season) {
        seasons.add(team.season);
    }

    savedGames
        .filter(
            (game) => game.teamId === teamId
        )
        .forEach((game) => {
            const gameSeason =
                game.season || team.season;

            if (gameSeason) {
                seasons.add(gameSeason);
            }
        });

    const seasonList =
        [...seasons].sort().reverse();

    reportsSeasonFilter.innerHTML = `
        <option value="">Select Season</option>

        ${seasonList
            .map((season) => {
                return `
                    <option value="${season}">
                        ${season}
                    </option>
                `;
            })
            .join("")}
    `;

    if (team.season) {
        reportsSeasonFilter.value =
            team.season;
    }
}

function renderTeamReport() {
    const reportsTeamCards =
    document.getElementById("reportsTeamCards");

    const reportsContent =
        document.getElementById("reportsContent");

    if (!reportsTeamCards || !reportsContent) {
        return;
    }

    const teamId =
    reportsTeamCards.dataset.selectedTeamId || "";

const reportsSeasonFilter =
    document.getElementById("reportsSeasonFilter");

const selectedSeason =
    reportsSeasonFilter?.value || "";

if (!teamId || !selectedSeason) {
        reportsContent.innerHTML = `
            <div class="emptyState">
                <h3>Select a team</h3>
                <p>
                    Choose a team to view season reports.
                </p>
            </div>
        `;

        return;
    }

    const team =
        teams.find(
            (item) => item.id === teamId
        );

    const teamGames =
    savedGames.filter((game) => {
        if (game.teamId !== teamId) {
            return false;
        }

        const gameSeason =
            game.season || team.season;

        return gameSeason === selectedSeason;
    }); 

    if (!team) {
        return;
    }

    if (teamGames.length === 0) {
        reportsContent.innerHTML = `
            <div class="emptyState">
                <h3>No completed games yet</h3>
                <p>
                    Complete a game for this team to begin building reports.
                </p>
            </div>
        `;

        return;
    }

    let wins = 0;
    let losses = 0;
    let ties = 0;
    let totalPointsFor = 0;
    let totalPointsAgainst = 0;

    teamGames.forEach((game) => {
        totalPointsFor +=
            Number(game.teamScore) || 0;

        totalPointsAgainst +=
            Number(game.opponentScore) || 0;

        if (game.teamScore > game.opponentScore) {
            wins += 1;
        } else if (
            game.teamScore < game.opponentScore
        ) {
            losses += 1;
        } else {
            ties += 1;
        }
    });

    const gamesPlayed =
        teamGames.length;

    const averagePointsFor =
        (
            totalPointsFor /
            gamesPlayed
        ).toFixed(1);

    const averagePointsAgainst =
        (
            totalPointsAgainst /
            gamesPlayed
        ).toFixed(1);

    const teamLabel = [
        team.schoolName,
        team.teamName
    ]
        .filter(Boolean)
        .join(" — ");

    // Team stats tracked in at least one of these games (also used for the
    // game-by-game trends table).
    const selectedTeamStats = [
        ...new Set(
            teamGames.flatMap((game) => getTrackedTeamStatKeys(game))
        )
    ];

    // Each average only uses games where that team stat was tracked.
    const teamStatAverages = selectedTeamStats.map((statKey) =>
        getSeasonTeamStatAverage(teamGames, statKey)
    );

    // A different team or season starts with the top lineups.
    if (
        seasonLineupContext?.team.id !== team.id ||
        seasonLineupContext?.season !== selectedSeason
    ) {
        seasonLineupShowAll = false;
    }

    // Roster order for the Player Game-by-Game selector.
    const playerSeasonStats = team.roster.map((player) => ({
        id: player.id,
        number: player.number,
        name: player.name
    }));

    reportsContent.innerHTML = `
        <div class="reportSection">
            <h3>${teamLabel}</h3>

            <div class="reportOverviewGrid">
                <div class="reportStatCard">
                    <span class="reportStatLabel">
                        Games
                    </span>

                    <strong class="reportStatValue">
                        ${gamesPlayed}
                    </strong>
                </div>

                <div class="reportStatCard">
                    <span class="reportStatLabel">
                        Record
                    </span>

                    <strong class="reportStatValue">
                        ${wins}-${losses}${
                            ties > 0
                                ? `-${ties}`
                                : ""
                        }
                    </strong>
                </div>

                <div class="reportStatCard">
                    <span class="reportStatLabel">
                        PPG
                    </span>

                    <strong class="reportStatValue">
                        ${averagePointsFor}
                    </strong>
                </div>

                <div class="reportStatCard">
                    <span class="reportStatLabel">
                        Opponent PPG
                    </span>

                    <strong class="reportStatValue">
                        ${averagePointsAgainst}
                    </strong>
                                </div>
            </div>

            <div class="reportTeamAverages">
                <h4>Team Averages</h4>

                <div class="reportAveragesGrid">
                    ${teamStatAverages
                        .map((stat) => {
                            const statLabel =
                                stat.statKey
                                    .replace(
                                        /([A-Z])/g,
                                        " $1"
                                    )
                                    .replace(
                                        /^./,
                                        (letter) =>
                                            letter.toUpperCase()
                                    );

                            return `
                                <div class="reportAverageCard${stat.percentage ? " reportAverageShooting" : ""}">
                                    <span class="reportAverageLabel">
                                        ${statLabel}
                                    </span>

                                    <strong class="reportAverageValue"><span class="reportAverageMain">${stat.average}</span><span class="reportAveragePercent">${
                                        stat.percentage
                                            ? `<span class="reportAverageDot"> · </span>${stat.percentage}`
                                            : ""
                                    }</span></strong>

                                    <small class="reportAverageGames">${stat.gamesLabel}</small>
                                </div>
                            `;
                        })
                        .join("")}
                </div>
            </div>
        </div>
                        </div>
            </div>

            ${renderSeasonPlayerSection(teamGames, team)}
                        </div>
        </div>

        ${renderSeasonShootingSection(teamGames, team)}

        ${renderSeasonLineupSection(teamGames, team, selectedSeason)}

        <div class="reportPlayerGameDetail">
    <div class="reportPlayerGameHeader">
        <h4>Player Game-by-Game</h4>

        <label class="reportPlayerFilter">
            Player

            <select id="reportPlayerFilter">
                <option value="">
                    Select Player
                </option>

                ${playerSeasonStats
                    .map((player) => {
                        return `
                            <option value="${player.id}">
                                ${
                                    player.number
                                        ? `#${player.number} `
                                        : ""
                                }${player.name}
                            </option>
                        `;
                    })
                    .join("")}
            </select>
        </label>
    </div>

    <div id="reportPlayerGameContent">
        <div class="reportPlayerPrompt">
            Select a player to view game-by-game stats.
        </div>
    </div>
</div>

        <div class="reportGameTrends">
            <h4>Game-by-Game Team Trends</h4>

            <div class="reportPlayerTableWrap">
                <table class="reportPlayerTable compactReportTable">
                    <thead>
                        <tr>
                            <th>Date</th>
                            <th>Opp</th>
                            <th>Result</th>
                            <th>Score</th>

                            ${selectedTeamStats
                                .map((statKey) => {
                                    const teamStatLabels = {
    offensiveRebounds: "ORebs",
    defensiveRebounds: "DRebs",
    opponentOffensiveRebounds: "Opp ORebs",
    transitionPoints: "Trans Pts",
    paintTouches: "Paint Tchs",
    turnovers: "TO's",
    forcedTurnovers: "Forced TO's",
    fouls: "Fouls"
};

                                    const statLabel =
                                        teamStatLabels[statKey] ||
                                        statKey
                                            .replace(
                                                /([A-Z])/g,
                                                " $1"
                                            )
                                            .replace(
                                                /^./,
                                                (letter) =>
                                                    letter.toUpperCase()
                                            );

                                    return `
                                        <th>${statLabel}</th>
                                    `;
                                })
                                .join("")}
                        </tr>
                    </thead>

                    <tbody>
                        ${teamGames
                            .map((game) => {
                                let result = "T";

                                if (
                                    game.teamScore >
                                    game.opponentScore
                                ) {
                                    result = "W";
                                }

                                if (
                                    game.teamScore <
                                    game.opponentScore
                                ) {
                                    result = "L";
                                }

                                return `
                                    <tr>
                                        <td>
                                            ${game.gameDate || "—"}
                                        </td>

                                        <td>
                                            ${game.opponent || "—"}
                                        </td>

                                        <td>
                                            ${result}
                                        </td>

                                        <td>
                                            ${game.teamScore}-${game.opponentScore}
                                        </td>

                                        ${selectedTeamStats
    .map((statKey) => {
        const statValue =
            game.teamStats?.[statKey];

        // "—" when this game didn't track the stat; 0 when tracked but zero.
        if (!getTrackedTeamStatKeys(game).includes(statKey)) {
            return `
                <td>—</td>
            `;
        }

        if (
    statKey === "fieldGoals" ||
    statKey === "threePointers" ||
    statKey === "freeThrows"
) {
            return `
                <td>
                    ${formatShootingStat(statValue)}
                </td>
            `;
        }

        return `
            <td>
                ${Number(statValue) || 0}
            </td>
        `;
    })
    .join("")}
                                    </tr>
                                `;
                            })
                            .join("")}
                    </tbody>
                </table>
            </div>
        </div>
    </div>
`;
}

function renderPlayerGameReport() {
    const playerFilter =
        document.getElementById("reportPlayerFilter");

    const playerContent =
        document.getElementById("reportPlayerGameContent");

    const reportsSeasonFilter =
        document.getElementById("reportsSeasonFilter");

    if (
    !playerFilter ||
    !playerContent ||
    !reportsSeasonFilter
) {
    return;
}

    const playerId = playerFilter.value;
    const reportsTeamCards =
    document.getElementById("reportsTeamCards");

const teamId =
    reportsTeamCards?.dataset.selectedTeamId || "";
    const selectedSeason = reportsSeasonFilter.value;

    if (!playerId) {
        playerContent.innerHTML = `
            <div class="reportPlayerPrompt">
                Select a player to view game-by-game stats.
            </div>
        `;
        return;
    }

    const team =
        teams.find(
            (item) => item.id === teamId
        );

    if (!team) {
        return;
    }

    const player =
        team.roster.find(
            (item) => item.id === playerId
        );

    if (!player) {
        return;
    }

    const playerGames =
        savedGames.filter((game) => {
            if (game.teamId !== teamId) {
                return false;
            }

            const gameSeason =
                game.season || team.season;

            return (
                gameSeason === selectedSeason &&
                game.playerStatsById?.[playerId]
            );
        });

    // Stats each game actually tracked: untracked stats show "—",
    // tracked stats with nothing recorded show 0.
    const trackedByGame = new Map(
        playerGames.map((game) => [game, getTrackedPlayerStatKeys(game)])
    );

    // Same participation rule as season GP: started, came in as a
    // substitute, or recorded a stat. Other games show "DNP".
    const playedByGame = new Map(
        playerGames.map((game) => [game, getPlayersWhoPlayed(game).has(playerId)])
    );

    const playerStats =
        getPlayerCounterStatKeys().filter((statKey) =>
            playerGames.some(
                (game) =>
                    playedByGame.get(game) &&
                    trackedByGame.get(game).has(statKey)
            )
        );

    // Older games where a bench player without a stat can't be told apart
    // from one who didn't play.
    const olderGames = playerGames.filter(
        (game) => getParticipationEvidence(game) !== "full"
    ).length;

    const dnpNote = olderGames
        ? `
            <p class="seasonNote seasonLimitationNote playerDnpNote">
                ${olderGames} of these game${olderGames === 1 ? " was" : "s were"} saved before Court94
                recorded substitutions. In ${olderGames === 1 ? "that game" : "those games"}, DNP means the
                player didn't start and recorded no stats; they may have come off the bench briefly.
            </p>
        `
        : "";

    playerContent.innerHTML = `
        <div class="reportPlayerTableWrap">
            <table class="reportPlayerTable compactReportTable">
                <thead>
                    <tr>
                        <th>Date</th>
                        <th>Opp</th>
                        <th>PTS</th>
                        <th>REB</th>

                        ${playerStats
                            .map((statKey) => {
                                const statLabels = {
                                    offensiveRebounds: "ORebs",
                                    defensiveRebounds: "DRebs",
                                    turnovers: "TO's",
                                    assists: "AST",
                                    steals: "STL",
                                    blocks: "BLK"
                                };

                                return `
                                    <th>
                                        ${
                                            statLabels[statKey] ||
                                            statKey
                                        }
                                    </th>
                                `;
                            })
                            .join("")}
                    </tr>
                </thead>

                <tbody>
                    ${playerGames
                        .map((game) => {
                            const stats =
    game.playerStatsById[playerId];

const tracked = trackedByGame.get(game);

if (!playedByGame.get(game)) {
    return `
                                <tr class="dnpRow">
                                    <td>${game.gameDate || "—"}</td>
                                    <td>${game.opponent || "—"}</td>
                                    <td colspan="${playerStats.length + 2}">DNP</td>
                                </tr>
                            `;
}

// REB only when both rebound stats were tracked in this game.
const totalRebounds =
    tracked.has("offensiveRebounds") && tracked.has("defensiveRebounds")
        ? (Number(stats.offensiveRebounds) || 0) +
          (Number(stats.defensiveRebounds) || 0)
        : "—";

return `
                                <tr>
                                    <td>
                                        ${game.gameDate || "—"}
                                    </td>

                                    <td>
                                        ${game.opponent || "—"}
                                    </td>

                                    <td>
    ${tracked.has("points") ? Number(stats.points) || 0 : "—"}
</td>

<td>
    ${totalRebounds}
</td>

${playerStats
                                        .map((statKey) => {
                                            return `
                                                <td>
                                                    ${
                                                        tracked.has(statKey)
                                                            ? Number(stats[statKey]) || 0
                                                            : "—"
                                                    }
                                                </td>
                                            `;
                                        })
                                        .join("")}
                                </tr>
                            `;
                        })
                        .join("")}
                </tbody>
            </table>
        </div>

        ${dnpNote}

        ${renderPlayerShootingByGame(playerGames, playerId)}
    `;
}

document
    .getElementById("reportsBtn")
    .addEventListener("click", () => {
        renderReportsTeamFilter();
        renderReportsSeasonFilter();
        showScreen("reports");
    });

    document
    .getElementById("reportsTeamCards")
    .addEventListener("click", (event) => {
        const card = event.target.closest(
            "[data-reports-team-id]"
        );

        if (!card) {
            return;
        }

        const reportsTeamCards =
            document.getElementById("reportsTeamCards");

        reportsTeamCards.dataset.selectedTeamId =
            card.dataset.reportsTeamId;
            selectedTeamId =
    card.dataset.reportsTeamId;

updateAppTeamBadge();

        document
            .querySelectorAll(".reportsTeamCard")
            .forEach((teamCard) => {
                teamCard.classList.toggle(
                    "activeReportsTeamCard",
                    teamCard === card
                );
            });

        renderReportsSeasonFilter();
        renderTeamReport();
    });

    document
    .getElementById("reportsSeasonFilter")
    .addEventListener("change", () => {
        renderTeamReport();
    });

    document
    .getElementById("reportsContent")
    .addEventListener("change", (event) => {
        if (
            event.target.id ===
            "reportPlayerFilter"
        ) {
            renderPlayerGameReport();
        }
    });

// Averages / Totals switch on Player Season Stats. Both tables are already
// built; this only changes which one shows, and is remembered while the
// app is open.
document
    .getElementById("reportsContent")
    .addEventListener("click", (event) => {
        const button = event.target.closest("[data-season-view]");

        if (!button) {
            return;
        }

        seasonStatsView = button.dataset.seasonView;

        const section = button.closest(".seasonPlayerSection");

        if (section) {
            section.dataset.view = seasonStatsView;
        }
    });

// Season Lineup Plus/Minus switches and Show all.
document
    .getElementById("reportsContent")
    .addEventListener("click", (event) => {
        const viewButton = event.target.closest("[data-season-lineup-view]");
        const gamesButton = event.target.closest("[data-season-lineup-games]");
        const moreButton = event.target.closest("[data-season-lineup-more]");

        if (viewButton) {
            seasonLineupView = viewButton.dataset.seasonLineupView;
        } else if (gamesButton) {
            seasonLineupIncludePartial =
                gamesButton.dataset.seasonLineupGames === "all";
        } else if (moreButton) {
            seasonLineupShowAll = !seasonLineupShowAll;
        } else {
            return;
        }

        refreshSeasonLineupSection();
    });

document
    .getElementById("settingsBtn")
    .addEventListener("click", () => {
        showScreen("settings");
    });

document
    .getElementById("recoveryWarning")
    .addEventListener("click", explainRecoveryWarning);

document
    .getElementById("addTeamButton")
    .addEventListener("click", openNewTeamForm);

document
    .getElementById("cancelTeamButton")
    .addEventListener("click", () => {
        showScreen("teams");
    });

document
    .getElementById("teamForm")
    .addEventListener("submit", saveTeamFromForm);

document
    .getElementById("addPlayerButton")
    .addEventListener("click", () => {
        rosterEditor.insertAdjacentHTML(
            "beforeend",
            `
                <div
                    class="rosterRow"
                    data-player-row="${crypto.randomUUID()}"
                >
                    <input
                        type="text"
                        inputmode="numeric"
                        placeholder="#"
                        aria-label="Jersey number"
                        data-player-number
                    >

                    <input
    type="text"
    placeholder="Player name"
    aria-label="Player name"
    data-player-name
>

<label class="keepAtTopOption">
    <input
        type="checkbox"
        data-player-keep-at-top
    >
    <span>Starter</span>
</label>

<button
    class="removePlayerButton"
    type="button"
>
    Delete Player
</button>
                </div>
            `
        );

        const newestRow = rosterEditor.lastElementChild;

        newestRow
            .querySelector(".removePlayerButton")
            .addEventListener("click", () => {
                if (rosterEditor.children.length === 1) {
                    alert(
                        "A team must have at least one roster row."
                    );
                    return;
                }

                newestRow.remove();
            });
    });
document
    .getElementById("editDetailsTeamButton")
    .addEventListener("click", () => {
        if (selectedTeamId) {
            openEditTeamForm(selectedTeamId);
        }
    });

document
    .getElementById("startTeamGameButton")
    .addEventListener("click", openNewGameScreen);
    document
    .getElementById("newGameForm")
    .addEventListener("submit", createGameConfirmation);

document
    .getElementById("cancelNewGameButton")
    .addEventListener("click", () => {
        if (selectedTeamId) {
            openTeamDetails(selectedTeamId);
        }
    });

document
    .getElementById("backToGameSetupButton")
    .addEventListener("click", () => {
        showScreen("newGame");
    });

document
    .getElementById("confirmStartGameButton")
    .addEventListener("click", () => {
        if (editingLiveGameSetup) {
            saveLiveGameSetupChanges();
        } else {
            startLiveGame();
        }
    });
    document
    .getElementById("editGameSetupButton")
    .addEventListener("click", openLiveGameSetupEditor);

    // (Optional: a page from another version may not have the bar.)
    document
    .getElementById("continueGameButton")
    ?.addEventListener("click", continueUnfinishedGame);

    document
    .getElementById("playersTabButton")
    .addEventListener("click", showTrackTab);

    document
    .getElementById("summaryTabButton")
    .addEventListener("click", () => {
        document
            .getElementById("summaryTabButton")
            .classList.add("activeTrackerTab");

        document
            .getElementById("playersTabButton")
            .classList.remove("activeTrackerTab");

        document
            .getElementById("summaryTrackerPanel")
            .classList.add("activeTrackerPanel");

        document
            .getElementById("playerTrackerPanel")
            .classList.remove("activeTrackerPanel");

        renderLiveSummary();
    });

document
    .getElementById("undoLastActionButton")
    .addEventListener("click", () => {
        undoLastAction();
        saveLiveGameState();
    });

// Red opponent scoring controls (shown only while Opponent Scoring is on).
document
    .querySelectorAll("[data-opponent-points]")
    .forEach((button) => {
        button.addEventListener("click", () => {
            recordOpponentPoints(Number(button.dataset.opponentPoints));
        });
    });

document
    .getElementById("opponentUndoButton")
    .addEventListener("click", undoOpponentPoints);

// The end-of-game score check updates as the opponent's score is typed.
document
    .getElementById("summaryOpponentScore")
    .addEventListener("input", () => {
        if (!viewingSavedGame) {
            renderEndOfGameLineups();
        }
    });

// Scores typed on the end-of-game summary are kept with the game in
// progress, so a reload or Back to Game brings them back.
[
    ["summaryTeamScore", "team"],
    ["summaryOpponentScore", "opponent"]
].forEach(([inputId, sideKey]) => {
    document.getElementById(inputId).addEventListener("input", () => {
        if (viewingSavedGame || !liveGameState?.summaryOpen) {
            return;
        }

        noteSummaryScoreTyped(sideKey);
    });
});

document
    document
    .getElementById("livePeriodSelect")
    .addEventListener("change", (event) => {
        if (!liveGameState) {
            return;
        }

        liveGameState.period =
            event.target.value;

        const currentPeriod =
            liveGameState.period;

        if (
            !liveGameState.teamStatsByPeriod[
                currentPeriod
            ]
        ) {
            liveGameState.teamStatsByPeriod[
                currentPeriod
            ] = createEmptyStatObject(
                getSelectedTeam()
                    .selectedTeamStats
            );
        }

        if (
            !liveGameState.playerStatsByPeriod[
                currentPeriod
            ]
        ) {
            liveGameState.playerStatsByPeriod[
                currentPeriod
            ] = {};

            const team = getSelectedTeam();

            team.roster.forEach((player) => {
                liveGameState.playerStatsByPeriod[
                    currentPeriod
                ][player.id] =
                    createEmptyStatObject(
                        team.selectedPlayerStats
                    );

                liveGameState.playerStatsByPeriod[
                    currentPeriod
                ][player.id].points = 0;
            });
        }

        saveLiveGameState();
    });
document
    document
    .getElementById("finishGameButton")
    .addEventListener("click", () => {
        const confirmed = window.confirm(
            "Are you sure you want to finish this game?"
        );

        if (!confirmed) {
            return;
        }

        openGameSummary();
    });

    document
    .getElementById("saveCompletedGameButton")
    .addEventListener("click", saveCompletedGame);

    document
    .getElementById("returnToLiveGameButton")
    .addEventListener("click", () => {
        if (viewingSavedGame) {
            const team = getSelectedTeam();

            if (team) {
                openTeamDetails(team.id);
            }

            return;
        }

        closeGameSummary();
    });

    homeButton.addEventListener("click", () => {
    const activeScreen =
        document.querySelector(".activeScreen");

    if (activeScreen?.id === "liveGameScreen") {
        const confirmed = window.confirm(
            "Leave the tracker?\n\nThis game stays in progress. To come back to it, tap Continue Game at the top of the screen.\n\nTo end the game, tap Finish Game instead."
        );

        if (!confirmed) {
            return;
        }
    }

    // The finished game isn't saved until Save Game is tapped.
    if (
        activeScreen?.id === "gameSummaryScreen" &&
        !viewingSavedGame &&
        liveGameState
    ) {
        const confirmed = window.confirm(
            "Leave without saving this game?\n\nThis game hasn't been saved yet. It stays here unsaved: tap Continue Game at the top of the screen to come back and save it.\n\nTap Cancel, then Save Game, to save it now."
        );

        if (!confirmed) {
            return;
        }
    }

    showScreen("home");
});

backButton.addEventListener("click", () => {
    const activeScreen =
        document.querySelector(".activeScreen");

        if (
    activeScreen.id === "liveGameScreen" &&
    document
        .getElementById("summaryTabButton")
        .classList.contains("activeTrackerTab")
) {
    document.getElementById("playersTabButton").click();
    return;
}   

        console.log(
    "ACTIVE SCREENS:",
    [...document.querySelectorAll(".activeScreen")].map(
        (screen) => screen.id
    )
);

    if (viewingSavedGame) {
        const team = getSelectedTeam();

        if (team) {
            viewingSavedGame = false;
            openTeamDetails(team.id);
            return;
        }
    }

    if (activeScreen.id === "gameSummaryScreen") {
    closeGameSummary();
    return;
    }

    if (activeScreen.id === "liveGameScreen") {
    openLiveGameSetupEditor();
    return;
}

if (
    activeScreen.id === "gameConfirmationScreen" &&
    editingLiveGameSetup
) {
    editingLiveGameSetup = false;
    showScreen("liveGame");
    return;
}

if (
    activeScreen.id === "gameConfirmationScreen" &&
    !editingLiveGameSetup
) {
    showScreen("newGame");
    return;
}

if (activeScreen.id === "newGameScreen") {
    showScreen("games");
    return;
}

    if (
        activeScreen.id === "teamSetupScreen" ||
        activeScreen.id === "teamDetailsScreen"
    ) {
        showScreen("teams");
    } else {
        showScreen("home");
    }
});

// Individual Shooting Stats needs Points: ticking it ticks Points, and
// unticking Points unticks it. One listener per checkbox area (Team Setup,
// and Game Setup / Edit Game Setup), so re-rendering never stacks them.
function connectShootingChoice(containerId, attributeName) {
    const container = document.getElementById(containerId);

    if (!container) {
        return;
    }

    container.addEventListener("change", (event) => {
        const statKey = event.target.getAttribute(attributeName);

        const pointsCheckbox = container.querySelector(
            `[${attributeName}="points"]`
        );

        const shootingCheckbox = container.querySelector(
            `[${attributeName}="individualShooting"]`
        );

        if (
            statKey === "individualShooting" &&
            event.target.checked &&
            pointsCheckbox
        ) {
            pointsCheckbox.checked = true;
        }

        if (
            statKey === "points" &&
            !event.target.checked &&
            shootingCheckbox
        ) {
            shootingCheckbox.checked = false;
        }
    });
}

connectShootingChoice("playerStatChoices", "data-player-stat");
connectShootingChoice("gamePlayerStatChoices", "data-game-player-stat");

renderStatChoices();
renderTeams();

const savedLiveGameRecovery =
    localStorage.getItem("court94LiveGameRecovery");

// What this page opened counts as saved by it (exactly as stored, even if
// it can't be read), so only later changes by another tab count as theirs.
lastSavedRecoveryText = savedLiveGameRecovery;

if (savedLiveGameRecovery) {
    try {
        const recoveryData =
            JSON.parse(savedLiveGameRecovery);

        if (recoveryData.liveGameState) {
            liveGameState =
                recoveryData.liveGameState;

            liveActionHistory =
                recoveryData.liveActionHistory || [];

            selectedLivePlayerId =
                recoveryData.selectedLivePlayerId || null;

            // Always the game's own team (another team may have been
            // selected while browsing during the game).
            selectedTeamId =
                recoveryData.liveGameState.teamId ||
                recoveryData.selectedTeamId ||
                null;

            currentGameSetup =
                recoveryData.currentGameSetup || null;
        }
    } catch (error) {
        console.error(
            "Court94 could not restore the live game.",
            error
        );
    }
}

// A game in progress that was already saved (the app closed right after
// Save Game) is not a game in progress any more.
if (
    liveGameState?.completedGameId &&
    savedGames.some((game) => game.id === liveGameState.completedGameId)
) {
    liveGameState = null;
    liveActionHistory = [];
    selectedLivePlayerId = null;
    currentGameSetup = null;
    saveLiveGameState();
}

let savedScreen =
    localStorage.getItem("court94CurrentScreen");

// The screen wasn't kept (e.g. the browser lost it in a crash) but a game is
// in progress: go back to that game.
if (liveGameState && !savedScreen) {
    savedScreen = liveGameState.summaryOpen ? "gameSummary" : "liveGame";
}

    if (
    savedScreen === "liveGame" &&
    liveGameState &&
    selectedTeamId
) {
    renderLiveGame();
}

// Reopened on the end-of-game summary: rebuild it from the game (scores,
// stats and anything typed), with the tracker ready behind it for Back to
// Game. A summary that can't be rebuilt (e.g. a past game being viewed)
// opens Home instead of an empty summary.
if (savedScreen === "gameSummary") {
    if (liveGameState?.summaryOpen && getSelectedTeam()) {
        renderLiveGame();
        openGameSummary();
    } else {
        savedScreen = "home";
    }
}

// Screens that depend on a team or form chosen before the app closed can't
// be rebuilt, and would open empty. Open the Teams list instead, except
// Edit Game Setup during a game, which goes back to that game.
if (
    ["teamDetails", "teamSetup", "newGame", "gameConfirmation"].includes(
        savedScreen
    )
) {
    if (
        savedScreen === "gameConfirmation" &&
        liveGameState &&
        !liveGameState.summaryOpen &&
        getSelectedTeam()
    ) {
        renderLiveGame();
        savedScreen = "liveGame";
    } else {
        savedScreen = "teams";
    }
}

if (savedScreen === "games") {
    renderGamesTeamFilter();
    renderGamesList();
}

if (savedScreen === "reports") {
    renderReportsTeamFilter();
    renderReportsSeasonFilter();
}

if (savedScreen && screens[savedScreen]) {
    showScreen(savedScreen);
} else {
    showScreen("home");
}