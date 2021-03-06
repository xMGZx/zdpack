const {dialog, app} = require("@electron/remote");
const {pack} = require("./packer/index");

class GUIBar {
    constructor() {
        this.progress = document.querySelector("progress");
        this.info = document.querySelector("#progress > span");
    }

    start(max, value=0, payload=null) {
        this.max = max;
        this.value = value;

        this.progress.max = max;
        this.progress.value = value;

        this.update(payload);
    }
    update(payload) {
        this.info.textContent = `${this.value}/${this.max} | ${Math.round(100 * this.value / this.max)} | ${payload?.item ?? "..."}`;
    }
    increment() {
        this.progress.value = ++this.value;
        this.info.textContent = "...";
    }
    stop() {}
}

const options = {
    type: "pack",
    output: "pack",
    mcv: 6,
};

window.addEventListener("DOMContentLoaded", () => {
    // Make all input fields never spellcheck
    for (const input of document.querySelectorAll("input")) {
        input.setAttribute("spellcheck", "false");
        input.onchange = function () {
            if (this.value !== "") {
                options[this.id] = this.value;
            } else {
                delete options[this.id];
            }
        };
    }

    // Bind select menu
    document.querySelector("select").onclick = function () {
        options.type = this.value;
    };

    // Implement functionality of locator/saver buttons
    for (const btn of document.querySelectorAll(".saver")) {
        btn.onclick = async () => {
            let v = (await dialog.showSaveDialog(app.win, {title: " "})).filePath;
            if (!v) return;
            if (btn.hasAttribute("noext") && v.includes(".")) v = v.substring(0, v.lastIndexOf("."));

            const id = btn.getAttribute("for");
            const input = document.getElementById(id);
            input.value = v;
            options[id] = v;
        };
    }
    for (const btn of document.querySelectorAll(".locator")) {
        btn.onclick = async () => {
            let v = (await dialog.showOpenDialog(app.win, {title: " ", extensions: [btn.getAttribute("ext")]})).filePaths[0];
            if (!v) return;
            if (btn.hasAttribute("noext") && v.includes(".")) v = v.substring(0, v.lastIndexOf("."));

            const id = btn.getAttribute("for");
            const input = document.getElementById(id);
            input.value = v;
            options[id] = v;
        };
    }

    // Implement functionality of pack button
    const finalizer = document.querySelector("#finalize > button");
    finalizer.onclick = async () => {
        try {
            finalizer.setAttribute("disabled", "");

            if (!options.output) options.output = "pack";
            console.log(options);
            await pack(JSON.parse(JSON.stringify(options)), new GUIBar()); // Copies options to stop any race conditions

            await dialog.showMessageBox(app.win, {
                title: " ",
                type: "info",
                message: "Packing complete! Check the output location for the file (or your Downloads folder!)."
            });
        } catch (err) {
            await dialog.showErrorBox("Fatal Error while packing.", `${err.stack}`);
        } finally {
            finalizer.removeAttribute("disabled");
        }
    };

    // Add functionality to each list
    for (const addBtn of document.querySelectorAll(".list > button")) {
        // Add functionality to list add buttons
        addBtn.onclick = function () {
            const list = this.parentElement;

            console.log(dialog);
            const paths = dialog.showOpenDialogSync(app.win, {properties: [addBtn.classList.contains("file") ? "openFile" : "openDirectory", "multiSelections"]});
            if (!paths) return;
            if (!options[list.id]) options[list.id] = [];
            options[list.id].push(...paths);
    
            for (const path of paths) {
                const div = document.createElement("div");
                div.innerHTML = "<input><button>-</button>";

                // Add functionality to input fields
                const input = div.querySelector("input");
                input.value = path;
                input.onchange = function () {
                    const item = this.parentElement;
                    const index = Array.prototype.indexOf.call(item.parentElement, item);
                    options[item.parentElement.parentElement.id][index] = this.value;
                };
                // Add functionality to remove button
                div.querySelector("button").onclick = function () {
                    const item = this.parentElement;
                    const index = Array.prototype.indexOf.call(item.parentElement, item);

                    const array = options[item.parentElement.parentElement.id];
                    array.splice(index, 1);
                    if (array.length == 0) delete options[item.parentElement.parentElement.id];
                    item.remove();
                };

                list.querySelector("div").insertAdjacentElement("beforeend", div);
            }
        };
    }
});