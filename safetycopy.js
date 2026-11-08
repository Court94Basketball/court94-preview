// Game-save safety copy.
//
// Court94 saves the game in progress (and Save Game saves the games list) in
// localStorage straight away. Browsers keep localStorage changes in memory
// and put them on disk a little later: Safari about half a second later,
// Chrome and Edge 5 seconds to a minute or more later. If the whole browser
// stops in between (it crashes, is force-quit, or the device loses power),
// those newest saves are gone.
//
// This keeps a second copy of the same two values in IndexedDB, whose saves
// are on disk when they finish (a few milliseconds). Each save is numbered;
// localStorage keeps the number of its newest save (court94SaveNumber). When
// Court94 opens and the copy is newer than localStorage, the browser lost
// saves, so the copy is put back and Court94 reopens with them.
//
// Tracking never waits for the copy: it's written in the background, and when
// a copy is already being written only the newest save waits for it.

const SAFETY_DB_NAME = "court94Safety";
const SAFETY_STORE = "copies";
const SAVE_NUMBER_KEY = "court94SaveNumber";
const SAFETY_RESTORED_KEY = "court94SafetyRestored";

let safetyDb = null;
let safetyWriting = false;
let safetyPending = null;
let safetyCopiedGamesText = null;
let safetyLastNumber = 0;
let safetyUserActed = false;

// Set while a newer copy is being put back, so nothing writes the older
// in-memory game over it before Court94 reopens (see script.js pagehide).
let safetyRestoring = false;

function openSafetyDb() {
    if (!safetyDb) {
        safetyDb = new Promise((resolve, reject) => {
            const request = indexedDB.open(SAFETY_DB_NAME, 1);

            request.onupgradeneeded = () => {
                request.result.createObjectStore(SAFETY_STORE);
            };
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
            request.onblocked = () => reject(new Error("blocked"));
        });
        safetyDb.catch(() => {});
    }

    return safetyDb;
}

// Called after every save of the game in progress, including the save that
// clears it after Save Game, and after a backup is restored.
function copyGameSave() {
    if (safetyRestoring || typeof indexedDB === "undefined") {
        return;
    }

    try {
        // Always above every earlier save, including saves made in another
        // tab and saves made before the device's clock was turned back.
        const number = Math.max(
            Date.now(),
            safetyLastNumber + 1,
            Number(localStorage.getItem(SAVE_NUMBER_KEY) || 0) + 1
        );

        localStorage.setItem(SAVE_NUMBER_KEY, String(number));
        safetyLastNumber = number;
        safetyPending = {
            number,
            recoveryText: localStorage.getItem(LIVE_GAME_STORAGE_KEY),
            gamesText: localStorage.getItem(GAMES_STORAGE_KEY)
        };
    } catch (error) {
        console.error("Court94 couldn't number the save:", error);
        return;
    }

    writeSafetyCopy();
}

async function writeSafetyCopy() {
    if (safetyWriting || !safetyPending) {
        return;
    }

    safetyWriting = true;
    const copy = safetyPending;
    safetyPending = null;

    try {
        await putSafetyCopy(
            copy,
            // The games list only changes when a game is saved.
            copy.gamesText !== safetyCopiedGamesText
        );
        safetyCopiedGamesText = copy.gamesText;
    } catch (error) {
        console.error("Court94 couldn't write the game safety copy:", error);
    }

    safetyWriting = false;
    writeSafetyCopy();
}

// Writes one numbered copy. Inside one transaction, each record is replaced
// only by a newer one, so a copy that finishes late (for example from
// another tab) never replaces a newer copy.
async function putSafetyCopy(copy, includeGames) {
    const db = await openSafetyDb();

    await new Promise((resolve, reject) => {
        const transaction = db.transaction(SAFETY_STORE, "readwrite", {
            durability: "strict"
        });
        const store = transaction.objectStore(SAFETY_STORE);

        const putIfNewer = (key, record) => {
            const existing = store.get(key);

            existing.onsuccess = () => {
                if (!existing.result || existing.result.number < record.number) {
                    store.put(record, key);
                }
            };
        };

        putIfNewer("game", {
            number: copy.number,
            recoveryText: copy.recoveryText
        });

        if (includeGames) {
            putIfNewer("games", {
                number: copy.number,
                gamesText: copy.gamesText
            });
        }

        transaction.oncomplete = resolve;
        transaction.onerror = () => reject(transaction.error);
        transaction.onabort = () => reject(transaction.error);
    });
}

function readSaveCopyRecord(db, key) {
    return new Promise((resolve, reject) => {
        const request = db
            .transaction(SAFETY_STORE, "readonly")
            .objectStore(SAFETY_STORE)
            .get(key);

        request.onsuccess = () => resolve(request.result || null);
        request.onerror = () => reject(request.error);
    });
}

function writeSaveCopyValue(storageKey, value) {
    if (value === null || value === undefined) {
        localStorage.removeItem(storageKey);
        return localStorage.getItem(storageKey) === null;
    }

    localStorage.setItem(storageKey, value);
    return localStorage.getItem(storageKey) === value;
}

// As Court94 opens: if the safety copy has saves that localStorage lost,
// put them back and reopen. Skipped once the coach has tapped anything.
async function restoreLostSaves() {
    if (typeof indexedDB === "undefined") {
        return;
    }

    const savedNumber = Number(localStorage.getItem(SAVE_NUMBER_KEY) || 0);
    safetyLastNumber = Math.max(safetyLastNumber, savedNumber);

    const db = await openSafetyDb();
    const game = await readSaveCopyRecord(db, "game");
    const games = await readSaveCopyRecord(db, "games");

    // (Read the number again: a save made meanwhile counts too.)
    const currentNumber = Number(localStorage.getItem(SAVE_NUMBER_KEY) || 0);

    if (!game || game.number <= currentNumber || safetyUserActed) {
        return;
    }

    // Never the same restore twice in this tab, so a restore that somehow
    // doesn't stick can't keep reopening Court94.
    if (sessionStorage.getItem(SAFETY_RESTORED_KEY) === String(game.number)) {
        return;
    }

    safetyRestoring = true;

    const previous = {
        recoveryText: localStorage.getItem(LIVE_GAME_STORAGE_KEY),
        gamesText: localStorage.getItem(GAMES_STORAGE_KEY),
        number: localStorage.getItem(SAVE_NUMBER_KEY)
    };

    try {
        // The games list is put back only if its copy is newer than what
        // localStorage kept (it may have been copied long before).
        const restoreGames = games && games.number > currentNumber;
        const restored =
            (!restoreGames || writeSaveCopyValue(GAMES_STORAGE_KEY, games.gamesText)) &&
            writeSaveCopyValue(LIVE_GAME_STORAGE_KEY, game.recoveryText) &&
            writeSaveCopyValue(SAVE_NUMBER_KEY, String(game.number));

        if (!restored) {
            throw new Error("The restored saves didn't read back correctly.");
        }
    } catch (error) {
        console.error("Court94 couldn't put back the lost saves:", error);

        try {
            writeSaveCopyValue(GAMES_STORAGE_KEY, previous.gamesText);
            writeSaveCopyValue(LIVE_GAME_STORAGE_KEY, previous.recoveryText);
            writeSaveCopyValue(SAVE_NUMBER_KEY, previous.number);
        } catch (putBackError) {
            console.error("Court94 couldn't undo the restore:", putBackError);
        }

        safetyRestoring = false;
        return;
    }

    console.warn("Court94 put back game saves the browser hadn't kept.");
    sessionStorage.setItem(SAFETY_RESTORED_KEY, String(game.number));
    location.reload();
}

["pointerdown", "touchstart", "mousedown", "keydown"].forEach((type) => {
    document.addEventListener(
        type,
        () => {
            safetyUserActed = true;
        },
        { capture: true, once: true }
    );
});

restoreLostSaves().catch((error) => {
    console.error("Court94 couldn't check the game safety copy:", error);
});
