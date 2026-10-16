#!/usr/bin/env node
// Bumps the Android app version everywhere it lives, so phones get the "Update available" prompt.
//   node scripts/android-release.mjs "What changed"        → +1 build, patch version (1.1.0 → 1.1.1)
//   node scripts/android-release.mjs "What changed" --force → users must update before continuing
// Then: npm run android:build → Android Studio: Build ▸ Generate Signed APK (release, keys/mapl-release.jks)
//       cp android/app/release/app-release.apk public/download/MaplTaskFlow.apk → git add -A && git commit && git push
// NOTE: only push app-version.json together with the new APK, or phones will be offered the old one.
import fs from "fs";
const root = new URL("..", import.meta.url).pathname;
const gradle = root + "android/app/build.gradle";
const cap = root + "capacitor.config.ts";
const ver = root + "public/app-version.json";

const g = fs.readFileSync(gradle, "utf8");
const code = Number(/versionCode (\d+)/.exec(g)[1]) + 1;
const name = /versionName "([^"]+)"/.exec(g)[1].split(".").map(Number);
name[2] = (name[2] ?? 0) + 1;
const versionName = name.join(".");
fs.writeFileSync(gradle, g.replace(/versionCode \d+/, `versionCode ${code}`).replace(/versionName "[^"]+"/, `versionName "${versionName}"`));

const c = fs.readFileSync(cap, "utf8");
fs.writeFileSync(cap, c.replace(/MaplTaskFlowApp\/\d+/, `MaplTaskFlowApp/${code}`));

const notes = process.argv[2] && !process.argv[2].startsWith("--") ? process.argv[2] : "Improvements and fixes.";
fs.writeFileSync(ver, JSON.stringify({ versionCode: code, versionName, apk: "/download/MaplTaskFlow.apk", notes, force: process.argv.includes("--force") }, null, 2) + "\n");
console.log(`Android app → version ${versionName} (build ${code}).`);
