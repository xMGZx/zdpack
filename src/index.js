// TODO: API for easily creating datapack files

const fs = require("fs-extra");
const nid = require("nid");
const path = require("path");
const pegjs = require("pegjs");
const pegutil = require("pegjs-util");

// Generate the CommandScript parser
const parser = pegjs.generate(fs.readFileSync(path.resolve(__dirname, "cmds.pegjs"), "utf-8"));

// Options and compiler state
const state = {
    // Constant numbers that need a scoreboard value set for them (since minecraft doesn't let you do constant multiplication and such)
    consts: new Set([-1]),
    // Dummy variables to initialize
    vars: new Set(["__temp__"]),
    // n value for compiled expressions
    n: 0,
    // randomly generated namespace to put auto-generated functions in so they don't conflict with anything.
    rng: "f" + nid(10),

    // Registered custom commands
    cmds: new Set(["ability","advancement","agent","allowlist","alwaysday","attribute","ban","ban-ip","banlist","bossbar","camerashake","changesetting","classroommode","clear","clearspawnpoint","clone","closechat","closewebsocket","code","codebuilder","connect","data","datapack","daylock","debug","dedicatedwsserver","defaultgamemode","deop","dialogue","difficulty","effect","enableencryption","enchant","event","execute","experience","fill","fog","forceload","function","gamemode","gamerule","gametest","getchunkdata","getchunks","geteduclientinfo","geteduserverinfo","getlocalplayername","getspawnpoint","gettopsolidblock","give","globalpause","help","immutableworld","item","kick","kill","lesson","list","listd","locate","locatebiome","loot","me","mobevent","msg","music","op","ops","pardon","pardon-ip","particle","permission","playanimation","playsound","publish","querytarget","recipe","reload","remove","replaceitem","ride","save","save-all","save-off","save-on","say","schedule","scoreboard","seed","setblock","setidletimeout","setmaxplayers","setworldspawn","spawnitem","spawnpoint","spectate","spreadplayers","stop","stopsound","structure","summon","tag","takepicture","team","teammsg","teleport","tell","tellraw","testfor","testforblock","testforblocks","tickingarea","time","title","titleraw","tm","toggledownfall","tp","trigger","videostream","w","wb","weather","whitelist","worldborder","worldbuilder","wsserver","xp","achievement","banip","blockdata","broadcast","chunk","clearfixedinv","detect","entitydata","executeasself","home","position","mixer","resupply","say","setfixedinvslot","setfixedinvslots","setspawn","solid","stats","toggledownfall","transferserver","unban"]),
    callbacks: {},
};
exports.state = state;

class Selector {
    constructor(target, args=null) {
        this.target = target;
        this.args = args;
    }

    toString() {
        if (this.target.length > 1 && !this.args) return this.target;

        const entries = Object.entries(this.args ?? []);
        if (entries.length > 0) {
            return "@" + this.target + "[" + entries.map((s) => `${s[0]}:${stringify(s[1])}`).join() + "]";
        } else {
            return "@" + this.target;
        }
    }
}
exports.Selector = Selector;

class Range {
    constructor(min, max) {
        this.min = parseFloat(min ?? -Infinity);
        this.max = parseFloat(max ?? Infinity);
    }

    toString() {
        return `${isFinite(this.min) ? this.min : ""}..${isFinite(this.max) ? this.max : ""}`;
    }
}
exports.Range = Range;

class JointItem {
    constructor(item, state, nbt) {
        this.item = item;
        this.state = state;
        this.nbt = nbt;
    }

    toString() {
        const s = [this.item];

        if (this.state) s.push("[" + Object.entries(this.state).map((s) => `${s[0]}:${stringify(s[1])}`).join() + "]");
        if (this.nbt) s.push(stringify(this.nbt));

        return s.join("");
    }
}
exports.JointItem = JointItem;

/**
 * Stringifies something for use in MCFunction code.
 * @param {*} e The thing to stringify
 * @param {boolean} quote Whether or not to quote quoted strings
 * @returns {string} A string to use in MCFunction code.
 */
function stringify(e, quote=true) {
    if (e instanceof String) {
        if (quote) return JSON.stringify(e);
        else return e;
    } else if (Array.isArray(e)) {
        return "[" + e.map((x) => stringify(x)).join() + "]";
    } else if (typeof e == "object" && !(e instanceof Selector)) {
        return "{" + Object.entries(e).map((s) => s[0].includes(" ") ? `"${s[0]}":${stringify(s[1])}` : `${s[0]}:${stringify(s[1])}`).join(",") + "}";
    } else {
        return String(e).replace(/[\r\n]+/g, "");
    }
}
exports.stringify = stringify;

/**
 * Takes a namespaced id (e.g. `minecraft:thing/another/third`) and converts it to a full path relative to the current working directory (e.g. `data/minecraft/{type}/thing/another/third.json`).
 * 
 * @param {string} type The folder underneath the namespace folder, like "tags" or "advancements".
 * @param {string} id A namespaced id. If it does not have an extension the extension is assumed to be `ext`. If a namespace is not given it is assumed to be "minecraft".
 * @param {string} ext If an extension is not provided in `id`, this is the extension to use for the file.
 * @param {string} root The root folder under the pack folder, "data" for datapacks and "assets" for resource packs.
 * @returns {string} A properly formatted path generated from the id.
 */
function resolveID(type, id, ext=".json", root="data") {
    if (!/^([a-z][a-z0-9_]*:)?[a-z][a-z0-9_]*(\/[a-z][a-z0-9_]*)*(\.[a-z][a-z0-9_]*)?$/.test(id)) throw new Error(`invalid namespaced id "${id}"`);

    const parts = id.split(/:/g);
    if (parts.length < 2) parts.unshift("minecraft");
    return path.join(root, parts[0], type, parts[1]) + (path.extname(id) ? "" : ext);
}
exports.resolveID = resolveID;

/**
 * Writes some JSON data to a file in the datapack pointed to by a namespaced id. If the file already exists, it will be overwriten.
 * 
 * @param {string} type The folder underneath the namespace folder, like "tags" or "advancements".
 * @param {string} id A namespaced id to be put into the `resolveID()` function. If it does not have an extension the extension is assumed to be ".json"
 * @param {string} root The root folder under the pack folder, "data" for datapacks and "assets" for resource packs. Defaults to "data".
 * @param {*} object A javascript object to convert into json.
 */
async function add(type, id, object, root="data") {
    const tid = resolveID(type, id, ".json", root);
    await fs.ensureFile(tid);
    await fs.writeJSON(tid, object);
}
exports.add = add;

/**
 * Creates or merges values in a tag (specified by a namespaced id).
 * 
 * @param {string} type The folder underneath the "tags" folder, like "items", "blocks", or "functions".
 * @param {string} id A namespaced id to be put into the `resolveID()` function. If it does not have an extension the extension is assumed to be ".json"
 * @param {string} values A list of strings/objects to use as values in the tag
 * @param {boolean} replace A boolean saying whether or not to replace an existing tag. When set to true (false is default), the `replace` field in the tag will be set and the values will not merge with an existing tag.
 * @param {*} object A javascript object to convert into json.
 */
async function addTag(type, id, values, replace=false) {
    const tid = resolveID("tags/"+type, id);
    if (replace) {
        await fs.ensureFile(tid);
        await fs.writeJSON(tid, {replace: true, values});
    } else {
        if (fs.existsSync(tid)) {
            const old = await fs.readJSON(tid);
            await fs.writeJSON(tid, {values: [...new Set([...old.values, ...values])]});
        } else {
            await fs.ensureFile(tid);
            await fs.writeJSON(tid, {values});
        }
    }
}
exports.addTag = addTag;

/**
 * Registers a command for use in CommandScript files.
 * If a callback is given, it is called with the id of the function as the first argument and the rest of the arguments of the command and should return a string (or list of strings to be joined by newline) of mcfunction code.
 * NBT will be turned into a plain object, selectors into a `Selector` object, number ranges into a `Range` object, and other values into strings, numbers, or 
 * @param {string} name The name of the command to register.
 * @param {Function} callback An optional callback function used to generate mcfunction code as a string based upon command arguments.
 */
function registerCmd(name, callback=undefined) {
    state.cmds.add(name);
    if (callback == undefined) {
        delete state.callbacks[name];
    } else {
        state.callbacks[name] = callback;
    }
}
exports.registerCmd = registerCmd;

/**
 * Unregisters a registered command for use in CommandScript files.
 * @param {string} name The name of the command to unregister.
 */
function unregisterCmd(name) {
    delete state.callbacks[name];
    state.cmds.delete(name);
}
exports.unregisterCmd = unregisterCmd;

/**
 * Compiles the ast of a command into a list of strings to use as mcfunction code.
 * @param {object} ast CommandScript AST of a single command.
 * @returns {Promise<string[]>} a list of strings of mcfunction code
 */
async function compileCmd(ast) {
    if (ast.type != "cmd") throw TypeError("given object is not a command ast");

    if (ast.cmd == "execute") {
        const code = await compileCmd(ast.run);
        const cmd = "execute " + ast.args.map((v) => v instanceof String ? `"${v}"` : String(v)).join(" ");

        if (code.length > 1) {
            // If the resulting command generates more than one command, we need to create a separate function to run them all
            const loc = `${state.rng}:exec${state.n++}`;
            await addRawCmds(loc, code.join("\n"));
            return [cmd + " run function " + loc];
        } else if (code.length == 1) {
            // Just one command
            return [cmd + " run " + code[0]];
        } else {
            // Execute command with no run statement
            return [cmd];
        }
    } else if (state.cmds.has(ast.cmd)) {
        const callback = state.callbacks[ast.cmd];
        if (callback) {
            // Callback exists, so we call it with the arguments
            const out = await callback(...ast.args);
            if (Array.isArray(out)) return out;
            else return String(out).split("\n").map((v) => v.trim());
        }

        // No callback, so we reconstruct the command from just it's arguments
        return [ast.cmd + " " + ast.args.map((v) => v instanceof String ? `"${v}"` : String(v)).join(" ")];
    }
    
    throw Error(`command "${ast.cmd}" is not registered`);
}
exports.compileCmd = compileCmd;


/**
 * The plural version of `compileCmd()`, which works with a list of json data or a string.
 * @param {string | object} data
 * @returns {Promise<string[]>} a list of strings of mcfunction code
 */
async function compileCmds(data) {
    // Begin by parsing CommandScript into a JSON AST.
    const ast = typeof data == "string" ? parseCmds(data) : data;

    // TODO: try catch and give line number
    // Afterwards, read through JSON AST to create mcfunction code.
    const code = [];
    for (const cmd of ast) {
        try {
            code.push(...await compileCmd(cmd));
        } catch (err) {
            // Rethrow error with location data on failure
            if (cmd.loc) throw Error(`line ${cmd.loc.start.line}; ${err.message}`);
            else throw err;
        }
    }
    // const code = (await Promise.all(
    //     ast.map(async (cmd) => (await compileCmd(cmd)).join("\n"))
    // ));
    return code.join("\n").replace(/\n{2,}/, "\n").trim().split("\n");
}
exports.compileCmds = compileCmds;

/**
 * Parses CommandScript code into a JSON AST and returns the AST.
 * @param {string} data A string containing CommandScript code to parse.
 * @returns {object} JSON AST
 */
function parseCmds(data) {
    // Cleanup lines before parsing
    const pdata = data.replace(/\r\n|\r/g, "\n").replace(/[ \t]+\n\s+\.[ \t]+/g, " ") + "\n";

    return parser.parse(pdata, {
        Selector, Range, JointItem
    });
}
exports.parseCmds = parseCmds;

/**
 * Compiles CommandScript code (CommandScript is a superset of MCFunction) into MCFunction code, optionally with custom commands registered through `registerCmd()`.
 * @param {string} id A namespaced id to be put into the `resolveID()` function to determine where to output compiled code to. If it does not have an extension the extension is assumed to be ".mcfunction"
 * @param {string | object} data A string containing CommandScript code to compile, or JSON AST returned from `parseCmds()` or as a command argument.
 * @param {boolean} append By default, the compiled code will overwrite the file at the given `id`. Set this to true to instead append to the end of the mcfunction file if it exists.
 * @param {boolean} raw Whether or not data is raw mcfunction code rather than CommandScript. Defaults to false.
 */
async function addCmds(id, data, append=false, raw=false) {
    const code = raw ? data : compileCmds(data).join("\n");

    // Finally write the code to the file
    const loc = resolveID("functions", id, ".mcfunction");
    await fs.ensureFile(loc);
    if (append) {
        await fs.writeFile(loc, code + "\n");
    } else {
        await fs.appendFile(loc, "\n" + code + "\n");
    }
}
exports.addCmds = addCmds;

/**
 * Shorthand for `addCmds(id, data, append, true)`, append defaults to false
 */
async function addRawCmds(id, data, append=false) {
    await addCmds(id, data, append, true);
}
exports.addRawCmds = addRawCmds;

/**
 * Writes necessary data to function tags as well as generating a load function with certain variable creation.
 * There's no need to call this manually if you're using zdpack.
 */
async function finalize() {
    // Create load function to auto-create necessary variables
    const loc = `${state.rng}:load`;
    await addTag("functions", "minecraft:load", [loc]);
    await addRawCmds(loc,
        [...state.vars].map((v) => `scoreboard objectives remove ${v}\nscoreboard objectives add ${v} dummy`).join("\n") + "\n" +
        [...state.consts].map((v) => `scoreboard players set ${v} __temp__ ${v}`).join("\n"),
    );
}
exports.finalize = finalize;

exports.parseExpr = require("./expr").parseExpr;
exports.pack = require("./packer").pack;
require("./register");