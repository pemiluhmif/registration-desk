/**
 * Database layer
 *
 * @author Muhammad Aditya H.
 * @author Joshua C. Randiny
 */

var sqlite3 = require('sqlite3');
var db = null;

var nodeId = null;
var nodeType = null;
var machineKey = null;
var originHash = null;
var dbUrl = null;

/**
 * Initializes database object
 * Load SQLite database
 * @param dbUrl SQLite database URL
 */
exports.init = function(dbUrl,cbfunc) {
    // TODO load database and all necessary resources
    db = new sqlite3.Database(dbUrl,(err)=>{
        if(err){
            console.log(err.message);
            cbfunc(false);
        }else{
            console.log("Sukses");
            initTable();
            cbfunc(true);
        }
    });
};

function initTable(){
    db.run(`CREATE TABLE IF NOT EXISTS voters (
        nim INTEGER,
        name TEXT,
        last_queued TIMESTAMP,
        voted INTEGER DEFAULT 0,
        last_modified TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    `);

    db.run(`CREATE TABLE IF NOT EXISTS vote_record (
    	vote_id INTEGER,
        node_id INTEGER,
        previous_signature BLOB,
        voted_candidate INTEGER,
        signature BLOB
    );
    `);

    db.run(`CREATE TABLE IF NOT EXISTS last_signature (
        node_id INTEGER,
        last_signature BLOB,
        last_signature_signature BLOB
    );
    `);

    console.log("created");
}

/**
 * Close the database connection
 */
exports.close = function() {
    // TODO load database and all necessary resources
    db.close();
};

/**
 * Load Initialization Manifest and persists it to SQLite
 * @param initData initialization manifest JSON object
 */
exports.loadInitManifest = function(initData) {
    // TODO persists
};

/**
 * Loads machine key to memory
 * @param machine_key machine key
 */
exports.authorize = function(machine_key) {
    machineKey = machine_key;
    // TODO do authorize
};

/**
 * Update vote data
 * @param node_id node ID the data coming from
 * @param vote_records JSON of vote records
 */
exports.performVoteDataUpdate = function(node_id, vote_records) {
    /* TODO perform data update.
     * Data coming in from this method belongs to an individual node, one at a time.
     * If a record of the same vote_id exists, prioritize the data coming from the node of which the data is generated.
     */
};

/**
 * Update person data
 * @param node_id node ID the data coming from
 * @param person_records JSON of vote records
 */
exports.performPersonDataUpdate = function(node_id, person_records) {
    /* TODO perform data update.
     * Data coming in from this method belongs to an individual node, one at a time.
     * If a record of the same NIM exists, prioritize the most recent data
     */
};