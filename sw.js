// Court94 offline helper (service worker).
//
// Keeps a complete copy of the app's files on this device so Court94 opens
// without internet. It never reads or changes saved teams, games or the game
// recovery: those stay in localStorage, which a service worker can't reach.
//
// How versions stay safe:
// - Each version's files are saved together in their own copy
//   ("court94-app-<version>"), and every file is checked against the
//   fingerprint below before the copy counts as complete.
// - The copy Court94 opens from ("current") only changes when the app itself
//   says so (offline.js), which it does only when Court94 opens with no game
//   in progress. A newer copy waits until then ("latest").
// - Every file of one page comes from the same copy, so versions never mix.

// ---------- App files (update with every release) ----------
// The fingerprints are SHA-256 hashes of each file exactly as Git stores it
// (`git show :<file> | sha256sum` after `git add`), which is what the site
// serves. A new release changes them, which is how iPads notice the update; a
// fingerprint left out of date stops the update from installing, never mixes
// versions. APP_VERSION is the first 10 characters of the SHA-256 of the
// "<file> <fingerprint>" lines.
const APP_VERSION = "add1fbd780";
const APP_FILES = {
    "index.html": "16092dbef4108fffaa4f3203f56c2fbf5d2ad3ece14795e9c4770a77d417bdf9",
    "style.css": "114813a45ddc2b87e6c868c90584c4c2216d0693109fb8544fda4aaf6ea9d52a",
    "script.js": "6c19c5e7328f675ae8b2204452bbc8ef0f818a4d2bae37e9699b9995f39c43bd",
    "backup.js": "e94ac339ff2e2354929f0fd8e23ed096b6c8257794469e604cab9b0e6fbcdda4",
    "storage.js": "cc060a87718a83db2828d0ddcfb7cf24bde2a9ecea9e50248a0a77210f474de3",
    "offline.js": "9aae3a7cd4901b3217fa25652e4d4d24126849cf021ddacd0124efba8a93e775",
    "safetycopy.js": "17d84665623ed767b554d0aed704b4d74a1a2dac1c6085a9d43998c956a7759b",
    "images/Court94 Banner Logo.png": "f751396ce17a0b7138c9d153ad5d1a4ed368f03fc5aec3c9e3920f143f57681d",
    "images/Court94-logo.png": "d6337ca2da22f2d1ba490e7f659f86dce175454bc8700c3ee16a760dd2cfbfc4"
};
// ---------- End of app files ----------

const APP_CACHE_PREFIX = "court94-app-";
const APP_CACHE = APP_CACHE_PREFIX + APP_VERSION;
const META_CACHE = "court94-meta";
const MANIFEST_PATH = "__court94/manifest";
const CURRENT_PATH = "__court94/current";
const LATEST_PATH = "__court94/latest";
const ATTEMPT_PATH = "__court94/last-attempt";

// Which copy each open page was given, so its files all come from that copy.
const copyForPage = new Map();

function appUrl(path) {
    return new URL(path, self.registration.scope).href;
}

function appPath(path) {
    return new URL(appUrl(path)).pathname;
}

async function sha256(buffer) {
    const digest = await crypto.subtle.digest("SHA-256", buffer);

    return [...new Uint8Array(digest)]
        .map((byte) => byte.toString(16).padStart(2, "0"))
        .join("");
}

// Reading never creates the cache (caches.open would), so a removed copy
// stays removed.
async function readMeta(path) {
    const response = await caches.match(appUrl(path), {
        cacheName: META_CACHE
    });

    return response ? response.text() : null;
}

async function writeMeta(path, value) {
    const meta = await caches.open(META_CACHE);

    await meta.put(
        appUrl(path),
        new Response(value, { headers: { "Content-Type": "text/plain" } })
    );
}

// A copy is complete once its manifest is saved, which happens only after
// every file was saved and matched its fingerprint.
async function isCompleteCopy(cacheName) {
    if (!cacheName || !(await caches.has(cacheName))) {
        return false;
    }

    const cache = await caches.open(cacheName);
    const manifest = await cache.match(appUrl(MANIFEST_PATH));

    if (!manifest) {
        return false;
    }

    try {
        const { files } = await manifest.json();

        for (const path of Object.keys(files)) {
            if (!(await cache.match(appUrl(path)))) {
                return false;
            }
        }

        return true;
    } catch (error) {
        return false;
    }
}

async function saveAppCopy() {
    if (Object.keys(APP_FILES).length === 0) {
        throw new Error("Court94: no app files listed");
    }

    if (await isCompleteCopy(APP_CACHE)) {
        return;
    }

    await caches.delete(APP_CACHE);
    const cache = await caches.open(APP_CACHE);

    try {
        for (const [path, fingerprint] of Object.entries(APP_FILES)) {
            // "reload" skips any copy the browser kept, so a release is never
            // mixed with files from before it.
            let response;

            try {
                response = await fetch(appUrl(path), { cache: "reload" });
            } catch (error) {
                throw new Error(`${path} couldn't be downloaded (${error.message})`);
            }

            if (!response.ok) {
                throw new Error(`${path}: the website answered ${response.status} instead of the file`);
            }

            const body = await response.arrayBuffer();

            if ((await sha256(body)) !== fingerprint) {
                throw new Error(
                    `${path} doesn't match this version (got ${body.byteLength} bytes, ` +
                    `${response.headers.get("Content-Type") || "no type"})`
                );
            }

            await cache.put(
                appUrl(path),
                new Response(body, {
                    headers: {
                        "Content-Type":
                            response.headers.get("Content-Type") ||
                            "application/octet-stream"
                    }
                })
            );
        }

        await cache.put(
            appUrl(MANIFEST_PATH),
            new Response(
                JSON.stringify({
                    version: APP_VERSION,
                    files: APP_FILES,
                    savedAt: new Date().toISOString()
                }),
                { headers: { "Content-Type": "application/json" } }
            )
        );
    } catch (error) {
        await caches.delete(APP_CACHE);
        throw error;
    }

    if (!(await isCompleteCopy(APP_CACHE))) {
        throw new Error("Court94: the offline copy couldn't be completed");
    }
}

async function recordAppCopy() {
    await writeMeta(LATEST_PATH, APP_CACHE);

    // The first copy on this device (or one replacing a copy that is gone)
    // is used straight away. Otherwise the app decides when to switch.
    const current = await readMeta(CURRENT_PATH);

    if (!(await isCompleteCopy(current))) {
        await writeMeta(CURRENT_PATH, APP_CACHE);
    }
}

// What happened the last time this version tried to save its copy (shown in
// Settings when Court94 isn't ready to open without internet).
async function recordAttempt(problem) {
    await writeMeta(
        ATTEMPT_PATH,
        JSON.stringify({
            version: APP_VERSION,
            at: new Date().toISOString(),
            problem
        })
    );
}

// The copy to open: the current one, or if that is gone, the newest one.
async function chooseAppCopy() {
    const current = await readMeta(CURRENT_PATH);

    if (await isCompleteCopy(current)) {
        return current;
    }

    const latest = await readMeta(LATEST_PATH);

    return (await isCompleteCopy(latest)) ? latest : null;
}

// Removes complete copies that are neither in use nor the newest. Copies
// still being saved have no manifest yet, so they are never removed here.
async function removeOldCopies() {
    const keep = new Set([
        APP_CACHE,
        await readMeta(CURRENT_PATH),
        await readMeta(LATEST_PATH)
    ]);

    for (const name of await caches.keys()) {
        if (
            name.startsWith(APP_CACHE_PREFIX) &&
            !keep.has(name) &&
            (await isCompleteCopy(name))
        ) {
            await caches.delete(name);
        }
    }
}

function isAppPage(url) {
    const scopePath = new URL(self.registration.scope).pathname;

    return url.pathname === scopePath || url.pathname === appPath("index.html");
}

function isAppFile(url) {
    return Object.keys(APP_FILES).some((path) => appPath(path) === url.pathname);
}

async function openApp(event) {
    try {
        const copy = await chooseAppCopy();

        if (copy) {
            const cache = await caches.open(copy);
            const page = await cache.match(appUrl("index.html"));

            if (page) {
                if (event.resultingClientId) {
                    copyForPage.set(event.resultingClientId, copy);
                }

                event.waitUntil(removeOldCopies().catch(() => {}));
                return page;
            }
        }
    } catch (error) {
        console.error("Court94 couldn't open its offline copy:", error);
    }

    // No saved copy (for example, the browser removed it): open from the
    // internet and save a new copy of this version in the background. If the
    // site already has a newer version, its files won't match, nothing is
    // saved, and the newer helper saves its own copy instead.
    event.waitUntil(
        saveAppCopy()
            .then(recordAppCopy)
            .then(() => recordAttempt(""))
            .catch((error) => recordAttempt(error.message))
            .catch(() => {})
    );

    return fetch(event.request);
}

async function serveAppFile(event) {
    try {
        const copy =
            copyForPage.get(event.clientId) || (await chooseAppCopy());

        if (copy) {
            const cache = await caches.open(copy);
            const url = new URL(event.request.url);
            const file = await cache.match(url.origin + url.pathname);

            if (file) {
                return file;
            }
        }
    } catch (error) {
        console.error("Court94 couldn't read its offline copy:", error);
    }

    return fetch(event.request);
}

self.addEventListener("install", (event) => {
    // A new helper can start straight away: it serves the copy the app
    // chose, so starting it never changes the version a page is using.
    event.waitUntil(
        saveAppCopy()
            .then(recordAppCopy)
            .then(() => recordAttempt(""))
            .then(() => self.skipWaiting())
            .catch(async (error) => {
                await recordAttempt(error.message).catch(() => {});
                throw error;
            })
    );
});

self.addEventListener("activate", (event) => {
    event.waitUntil(removeOldCopies());
});

self.addEventListener("fetch", (event) => {
    const request = event.request;

    if (request.method !== "GET") {
        return;
    }

    const url = new URL(request.url);

    if (url.origin !== self.location.origin) {
        return;
    }

    if (request.mode === "navigate") {
        if (isAppPage(url)) {
            event.respondWith(openApp(event));
        }

        return;
    }

    if (isAppFile(url)) {
        event.respondWith(serveAppFile(event));
    }
});
