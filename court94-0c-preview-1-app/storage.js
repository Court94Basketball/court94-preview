// Court94 Storage Safety
//
// Read-only information about this device's storage, a space check with
// low-storage warnings, and Settings controls for the restore safety copy
// (court94PreRestoreBackup, written by backup.js before a restore).
//
// Nothing here changes teams, games or the game in progress. The space check
// only writes a temporary filler to its own key (STORAGE_CHECK_KEY, removed
// at once, and again at startup by script.js) and never runs during a game.
// The safety copy is only ever removed when the coach confirms it.

const STORAGE_LOW_PERCENT = 70;
const STORAGE_CRITICAL_PERCENT = 85;

// The space check stops once this much filler fits: anything more is
// plenty. It measures to within STORAGE_CHECK_STEP_CHARS.
const STORAGE_CHECK_MAX_CHARS = 8 * 1024 * 1024;
const STORAGE_CHECK_FIRST_CHARS = 256 * 1024;
const STORAGE_CHECK_STEP_CHARS = 16 * 1024;

// Total space found by the last space check (used + free), or that there
// was plenty, so storage can be estimated without checking again: during a
// game, and after saving a game.
let storageCapacityChars = null;
let storageSpacePlenty = false;
let storageSpaceMeasured = false;
let lastStorageCheck = null;
let safetyCopyDownloaded = false;

// ---------- Measuring ----------

function formatStorageSize(chars) {
    const megabytes = chars / (1024 * 1024);

    if (megabytes >= 0.95) {
        return `${megabytes.toFixed(1)} MB`;
    }

    return `${Math.max(1, Math.round(chars / 1024))} KB`;
}

// Everything this site keeps in localStorage, in characters (keys + values).
function measureStorageUsedChars() {
    let usedChars = 0;

    for (let index = 0; index < localStorage.length; index += 1) {
        const key = localStorage.key(index);

        if (key === STORAGE_CHECK_KEY) {
            continue;
        }

        usedChars += key.length + (localStorage.getItem(key) || "").length;
    }

    return usedChars;
}

function canStoreFiller(chars) {
    try {
        localStorage.removeItem(STORAGE_CHECK_KEY);
        localStorage.setItem(STORAGE_CHECK_KEY, "0".repeat(chars));
        return true;
    } catch (error) {
        return false;
    }
}

// Finds how much more this device will store by writing filler to the check
// key only, growing it until it no longer fits. Returns { freeChars, plenty }.
function measureFreeStorageChars() {
    let fits = 0;
    let doesNotFit = null;
    let size = STORAGE_CHECK_FIRST_CHARS;

    try {
        while (size <= STORAGE_CHECK_MAX_CHARS) {
            if (!canStoreFiller(size)) {
                doesNotFit = size;
                break;
            }

            fits = size;
            size *= 2;
        }

        if (doesNotFit === null) {
            return { freeChars: fits, plenty: true };
        }

        while (doesNotFit - fits > STORAGE_CHECK_STEP_CHARS) {
            const middle = Math.floor((fits + doesNotFit) / 2);

            if (canStoreFiller(middle)) {
                fits = middle;
            } else {
                doesNotFit = middle;
            }
        }

        return { freeChars: fits, plenty: false };
    } finally {
        try {
            localStorage.removeItem(STORAGE_CHECK_KEY);
        } catch (error) {
            console.error("Court94 could not remove the storage check:", error);
        }
    }
}

function getStorageLevel(percent) {
    if (percent === null) {
        return "unknown";
    }

    if (percent >= STORAGE_CRITICAL_PERCENT) {
        return "critical";
    }

    return percent >= STORAGE_LOW_PERCENT ? "low" : "ok";
}

// Measures storage. The free-space part runs only when no game is in
// progress, and with measureSpace false only if it hasn't run yet; otherwise
// the last measured total is used.
function checkCourt94Storage(measureSpace = true) {
    const check = {
        usedChars: null,
        freeChars: null,
        plenty: false,
        percent: null,
        measured: false,
        failed: false,
        checkedAt: new Date()
    };

    try {
        check.usedChars = measureStorageUsedChars();

        if (!liveGameState && (measureSpace || !storageSpaceMeasured)) {
            const space = measureFreeStorageChars();

            check.freeChars = space.freeChars;
            check.plenty = space.plenty;
            check.measured = true;
            storageSpaceMeasured = true;
            storageSpacePlenty = space.plenty;
            storageCapacityChars = space.plenty
                ? null
                : check.usedChars + space.freeChars;
        } else if (storageSpacePlenty) {
            check.plenty = true;
            check.freeChars = STORAGE_CHECK_MAX_CHARS;
        }

        if (check.plenty) {
            check.percent = 0;
        } else if (storageCapacityChars) {
            check.percent = Math.min(
                100,
                Math.round((check.usedChars / storageCapacityChars) * 100)
            );
        }
    } catch (error) {
        console.error("Court94 could not check storage:", error);
        check.failed = true;
    }

    check.level = check.plenty ? "ok" : getStorageLevel(check.percent);
    lastStorageCheck = check;

    return check;
}

// ---------- Restore safety copy ----------

function readSafetyCopy() {
    let raw = null;

    try {
        raw = localStorage.getItem(PRE_RESTORE_STORAGE_KEY);
    } catch (error) {
        console.error("Court94 could not read the safety copy:", error);
    }

    if (raw === null) {
        return null;
    }

    let copy = null;

    try {
        copy = JSON.parse(raw);
    } catch (error) {
        console.error("Court94 could not read the safety copy:", error);
    }

    const savedAt = copy && copy.savedAt ? new Date(copy.savedAt) : null;

    return {
        raw,
        copy: isPlainObject(copy) ? copy : null,
        savedAt: savedAt && !Number.isNaN(savedAt.getTime()) ? savedAt : null,
        sizeChars: PRE_RESTORE_STORAGE_KEY.length + raw.length
    };
}

function parseSafetyCopyList(raw) {
    if (raw === null || raw === undefined) {
        return [];
    }

    const list = JSON.parse(raw);

    if (list === null) {
        return [];
    }

    if (!Array.isArray(list)) {
        throw new Error("Safety copy list is not a list.");
    }

    return list;
}

// Turns the safety copy into an ordinary Court94 backup file (format 1),
// dated when the copy was taken, so Restore from Backup can read it.
function buildSafetyCopyBackup(safetyCopy) {
    const copy = safetyCopy.copy;
    const teams = parseSafetyCopyList(copy.teams);
    const games = parseSafetyCopyList(copy.games);
    const liveGameData = copy.liveGame ? JSON.parse(copy.liveGame) : null;
    const liveGame =
        isPlainObject(liveGameData) && isPlainObject(liveGameData.liveGameState)
            ? liveGameData
            : null;

    return {
        app: BACKUP_APP_NAME,
        backupFormat: BACKUP_FORMAT_VERSION,
        exportedAt: (safetyCopy.savedAt || new Date()).toISOString(),
        counts: {
            teams: teams.length,
            games: games.length,
            gameInProgress: Boolean(liveGame)
        },
        data: {
            teams,
            games,
            liveGame
        }
    };
}

function describeSafetyCopyDate(safetyCopy) {
    return safetyCopy.savedAt
        ? safetyCopy.savedAt.toLocaleString()
        : "an earlier restore";
}

function downloadSafetyCopy() {
    const status = document.getElementById("safetyCopyStatus");
    const safetyCopy = readSafetyCopy();

    if (!safetyCopy) {
        renderSafetyCopy();
        return;
    }

    const fileTime = formatBackupFileTime(safetyCopy.savedAt || new Date());

    try {
        if (!safetyCopy.copy) {
            throw new Error("Safety copy is not readable as a backup.");
        }

        const backup = buildSafetyCopyBackup(safetyCopy);
        const fileName = `court94-restore-safety-copy-${fileTime}.json`;

        downloadCourt94File(fileName, JSON.stringify(backup, null, 2));
        safetyCopyDownloaded = true;
        status.textContent =
            `Safety copy downloaded as ${fileName} (${describeBackupCounts(backup.counts)}). ` +
            "You can restore it with Restore from Backup.";
    } catch (error) {
        console.error("Court94 could not convert the safety copy:", error);

        // Still give the coach exactly what is stored.
        const fileName = `court94-restore-safety-copy-unreadable-${fileTime}.json`;

        downloadCourt94File(fileName, safetyCopy.raw);
        safetyCopyDownloaded = true;
        status.textContent =
            `This safety copy couldn't be read as a backup, so it was downloaded exactly as stored (${fileName}).`;
    }
}

function removeSafetyCopy() {
    const status = document.getElementById("safetyCopyStatus");
    const safetyCopy = readSafetyCopy();

    if (!safetyCopy) {
        renderSafetyCopy();
        return;
    }

    const confirmed = window.confirm(
        `Remove the restore safety copy from ${describeSafetyCopyDate(safetyCopy)}?\n\n` +
        `It uses about ${formatStorageSize(safetyCopy.sizeChars)} on this device. ` +
        (safetyCopyDownloaded
            ? "You downloaded it a moment ago. "
            : "You haven't downloaded it yet. If you might need it, tap Cancel and download it first. ") +
        "Removing it can't be undone.\n\n" +
        "Your current teams and games are not affected."
    );

    if (!confirmed) {
        return;
    }

    let removed = false;

    try {
        localStorage.removeItem(PRE_RESTORE_STORAGE_KEY);
        removed = localStorage.getItem(PRE_RESTORE_STORAGE_KEY) === null;
    } catch (error) {
        console.error("Court94 could not remove the safety copy:", error);
    }

    refreshStorageSettings();

    status.textContent = removed
        ? "Safety copy removed. Your teams and games were not changed."
        : "Court94 couldn't remove the safety copy, so it is still on this device. Nothing was changed.";

    // Keep the message visible even when the block itself is now hidden.
    if (removed) {
        document.getElementById("backupStatus").textContent = status.textContent;
    }
}

function renderSafetyCopy() {
    const block = document.getElementById("safetyCopyBlock");
    const text = document.getElementById("safetyCopyText");

    if (!block || !text) {
        return;
    }

    const safetyCopy = readSafetyCopy();

    block.hidden = !safetyCopy;

    if (!safetyCopy) {
        return;
    }

    let contents = "";

    try {
        const backup = buildSafetyCopyBackup(safetyCopy);

        contents = ` (${describeBackupCounts(backup.counts)})`;
    } catch (error) {
        contents = "";
    }

    text.textContent =
        `Before your restore on ${describeSafetyCopyDate(safetyCopy)}, Court94 kept a copy of ` +
        `everything that was on this device then${contents}. It uses about ` +
        `${formatStorageSize(safetyCopy.sizeChars)}. Download it to keep it as a backup file. ` +
        "You can remove it to free up space; Court94 never removes it by itself.";
}

// ---------- Warnings ----------

function getStorageWarningText(check) {
    if (!check || (check.level !== "low" && check.level !== "critical")) {
        return "";
    }

    const safetyCopy = readSafetyCopy();
    const safetyCopyNote = safetyCopy
        ? ` A restore safety copy is using about ${formatStorageSize(safetyCopy.sizeChars)}; ` +
          "you can download and remove it under Settings → Backup & Restore."
        : "";

    if (check.level === "critical") {
        return (
            `Court94's storage on this device is almost full (about ${check.percent}%). ` +
            "Download a backup now. When storage is full, Court94 can't save new games " +
            "or team changes." + safetyCopyNote
        );
    }

    return (
        `Court94's storage on this device is about ${check.percent}% full. ` +
        "Download a backup regularly. If storage fills up, Court94 can't save new " +
        "games or team changes." + safetyCopyNote
    );
}

function renderStorageWarnings(check = lastStorageCheck) {
    const text = getStorageWarningText(check);

    ["teamStorageWarning", "storageWarning"].forEach((id) => {
        const note = document.getElementById(id);

        if (note) {
            note.textContent = text;
            note.hidden = !text;
        }
    });
}

// Called by script.js once a game is saved (never during a game). Uses the
// space found earlier, so saving stays quick; it checks only the first time.
function checkStorageAfterGameSaved() {
    const check = checkCourt94Storage(false);

    renderStorageWarnings(check);

    if (check.level === "critical") {
        alert(
            "Your game was saved.\n\n" +
            getStorageWarningText(check) +
            "\n\nGo to Settings to download a backup."
        );
    }
}

// ---------- Settings ----------

function describeStorageMode() {
    const standalone =
        navigator.standalone === true ||
        window.matchMedia?.("(display-mode: standalone)").matches;

    if (standalone) {
        return "Home Screen app";
    }

    return navigator.standalone === false
        ? "Safari (a Safari tab or a Home Screen bookmark that opens in Safari)"
        : "Web browser";
}

function describeSavedData() {
    try {
        const savedTeams = readStoredList(STORAGE_KEY);
        const savedGameList = readStoredList(GAMES_STORAGE_KEY);
        const inProgress = Boolean(localStorage.getItem(LIVE_GAME_STORAGE_KEY));

        return (
            `${countLabel(savedTeams.length, "team")}, ` +
            `${countLabel(savedGameList.length, "completed game")}` +
            (inProgress ? ", 1 game in progress" : "")
        );
    } catch (error) {
        console.error("Court94 could not read the saved data:", error);
        return "Couldn't be read";
    }
}

function describeStorageSpace(check) {
    if (check.failed) {
        return "Couldn't be checked";
    }

    if (check.plenty) {
        return `Plenty of space (more than ${formatStorageSize(check.freeChars)} free)`;
    }

    if (check.percent === null) {
        return "Checked when no game is in progress";
    }

    const estimate = check.measured
        ? ` (about ${formatStorageSize(check.freeChars)} free)`
        : " (estimated during the game in progress)";

    return `About ${check.percent}% full${estimate}`;
}

function addStorageRow(list, label, value) {
    const term = document.createElement("dt");
    const detail = document.createElement("dd");

    term.textContent = label;
    detail.textContent = value;
    list.append(term, detail);

    return detail;
}

function renderStorageInfo(check) {
    const list = document.getElementById("storageInfo");

    if (!list) {
        return;
    }

    list.replaceChildren();
    addStorageRow(list, "Court94 is open in", describeStorageMode());
    addStorageRow(list, "Saved on this device", describeSavedData());
    addStorageRow(
        list,
        "Space used by Court94",
        check.usedChars === null ? "Couldn't be checked" : `About ${formatStorageSize(check.usedChars)}`
    );
    addStorageRow(list, "Storage space", describeStorageSpace(check));

    const protection = addStorageRow(
        list,
        "Protected from automatic clearing",
        "Checking…"
    );

    addStorageRow(list, "Last checked", check.checkedAt.toLocaleTimeString());

    // Only reads the current status; it never asks for anything.
    if (navigator.storage && typeof navigator.storage.persisted === "function") {
        navigator.storage
            .persisted()
            .then((persisted) => {
                const browser =
                    navigator.standalone === undefined ? "The browser" : "Safari";

                protection.textContent = persisted
                    ? "Yes"
                    : `No. ${browser} may clear website data that isn't used for a while, so keep downloading backups.`;
            })
            .catch(() => {
                protection.textContent = "Unknown";
            });
    } else {
        protection.textContent = "Unknown on this browser";
    }
}

function refreshStorageSettings() {
    const check = checkCourt94Storage();

    renderStorageInfo(check);
    renderStorageWarnings(check);
    renderSafetyCopy();
}

function connectStorageControls() {
    document
        .getElementById("settingsBtn")
        ?.addEventListener("click", () => {
            safetyCopyDownloaded = false;
            document.getElementById("safetyCopyStatus").textContent = "";
            refreshStorageSettings();
        });

    document
        .getElementById("checkStorageButton")
        ?.addEventListener("click", refreshStorageSettings);

    document
        .getElementById("downloadSafetyCopyButton")
        ?.addEventListener("click", downloadSafetyCopy);

    document
        .getElementById("removeSafetyCopyButton")
        ?.addEventListener("click", removeSafetyCopy);
}

connectStorageControls();

// Reopened on Settings: fill it in.
if (document.getElementById("settingsScreen")?.classList.contains("activeScreen")) {
    refreshStorageSettings();
}
