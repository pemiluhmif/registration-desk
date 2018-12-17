/**
 * Pemilu HMIF
 * Manifest loader module
 *
 * This module loads the manifest, initialize the databases, and downloads all necessary resources
 */

const Database = require('./database');
const path = require('path');
var fs = require('fs-extra');
const fetch = require('electron-fetch').default;

/**
 * Load initialization manifest
 * @param filename file path to manifest
 * @param destination project folder path
 * @param callback status string callback
 */
exports.loadInitializationManifest = async function(filename, destination, callback) {
    let DB_PATH = path.join(destination, 'vote.db');
    let ASSETS_PATH = path.join(destination, 'assets');

    if(fs.existsSync(filename)) {
        if(callback !==undefined) callback("Parsing manifest");

        let manifestJson = JSON.parse(fs.readFileSync(filename));

        if(callback !==undefined) callback("Creating assets directory");

        // Delete assets directory, if any
        if (fs.existsSync(ASSETS_PATH))
            fs.removeSync(ASSETS_PATH);

        fs.mkdirSync(ASSETS_PATH);

        // Download assets
        if(callback !==undefined) callback("Downloading assets");
        await acquireAssets(manifestJson, ASSETS_PATH);

        // Initialize database
        if(callback !==undefined) callback("Initializing database");
        initializeDatabase(manifestJson, DB_PATH);
    } else {
        throw "File not found";
    }
};

/**
 * Download assets from the internet
 * @param manifest manifest JSON. Manifest JSON will be altered to match the new URL.
 * @param assets_path assets base path
 */
async function acquireAssets(manifest, assets_path) {
    // Download logo
    let logoUrl = manifest.logo_url;
    let logoFilename = await saveFile("logo", logoUrl, assets_path);
    manifest.logo_url = path.join(assets_path, logoFilename);

    // Download background
    let backgroundUrl = manifest.background_url;

    let bgFilename = await saveFile("bg", backgroundUrl, assets_path);
    manifest.background_url = path.join(assets_path, bgFilename);

    // For each candidate, download image
    for(let i = 0; i < manifest.candidates.length; i++) {
        let cpfilename = await saveFile("candidate_" + i, manifest.candidates[i].image_url, assets_path);
        manifest.candidates[i].image_url = path.join(assets_path, cpfilename);
    }
}

/**
 * Initialize database
 * @param manifest Manifest JSON
 * @param db_path db path
 */
function initializeDatabase(manifest, db_path) {
    let status = Database.init(db_path);

    if(status["status"]){
        console.log("Loading manifest from file..");
        let ret = Database.loadInitManifest(manifest);
        if (ret['status'] === false) {
            process.exit(1);
            throw "Error loading manifest";
        }
    } else {
        throw "Error on init: " + status["msg"];
    }
}

/**
 * Save file from the internet
 * @param file_prefix filename prefix
 * @param url url
 * @param assets_dir assets directory
 * @returns {string}
 */
async function saveFile(file_prefix, url, assets_dir) {
    console.log("Downloading " + url + "...");
    //let res = syncHttp('GET', url);

    let filename = file_prefix + "_" + getFileName(url);
    //fs.writeFileSync(assets_dir + "/" + filename, res.body);

    // Download
    let res = await fetch(url);

    // Write to file
    let dest = fs.createWriteStream(assets_dir + "/" + filename);
    res.body.pipe(dest);

    return filename;
}

/**
 * Get file name from url
 * @param url
 * @returns {string | *}
 */
function getFileName(url) {
    //this removes the anchor at the end, if there is one
    url = url.substring(0, (url.indexOf("#") == -1) ? url.length : url.indexOf("#"));
    //this removes the query after the file name, if there is one
    url = url.substring(0, (url.indexOf("?") == -1) ? url.length : url.indexOf("?"));
    //this removes everything before the last slash in the path
    url = url.substring(url.lastIndexOf("/") + 1, url.length);

    return url;
}