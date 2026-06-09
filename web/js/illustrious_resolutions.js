// ==========================================================================
//  Illustrious Resolution Preset Manager
// ==========================================================================
//
// Adds "save preset" / "delete preset" buttons to IllustriousEmptyLatentImage.
// Presets are persisted server-side (user/easy_illustrious/custom_resolutions.json)
// via the /illustrious/resolutions endpoints, so they survive pack updates and
// appear in the dropdown on every page load.

import { app } from "/scripts/app.js";
import { api } from "/scripts/api.js";

const NODE_NAME = "IllustriousEmptyLatentImage";

async function fetchJson(url, body) {
    const options = body
        ? {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(body),
          }
        : undefined;
    const res = await api.fetchApi(url, options);
    const data = await res.json();
    if (!res.ok || data.success === false) {
        throw new Error(data.error || `Request failed: ${url}`);
    }
    return data;
}

function applyOptions(node, options) {
    const widget = node.widgets?.find((w) => w.name === "resolution");
    if (!widget) return;
    const values = [...options, "Custom"];
    widget.options.values = values;
    if (!values.includes(widget.value)) {
        widget.value = values[0];
    }
}

function refreshAllNodes(options) {
    for (const node of app.graph._nodes ?? []) {
        if (node.comfyClass === NODE_NAME) {
            applyOptions(node, options);
        }
    }
    app.graph.setDirtyCanvas(true, false);
}

function getWidget(node, name) {
    return node.widgets?.find((w) => w.name === name);
}

async function savePreset(node) {
    const width = getWidget(node, "custom_width")?.value;
    const height = getWidget(node, "custom_height")?.value;
    if (!width || !height) {
        alert("Set custom_width/custom_height first.");
        return;
    }
    const name = prompt(
        `Save ${width}x${height} as a preset.\nOptional name (blank for automatic):`,
        ""
    );
    if (name === null) return; // cancelled
    try {
        const data = await fetchJson("/illustrious/resolutions/add", {
            width,
            height,
            name,
        });
        refreshAllNodes(data.options);
        const widget = getWidget(node, "resolution");
        if (widget) widget.value = data.label;
    } catch (e) {
        alert(`Failed to save preset: ${e.message}`);
    }
}

async function deletePreset(node) {
    const widget = getWidget(node, "resolution");
    const label = widget?.value;
    if (!label || label === "Custom") {
        alert("Select the preset you want to remove from the dropdown first.");
        return;
    }
    const isCustom = label.startsWith("Custom | ");
    const detail = isCustom
        ? "This deletes the saved custom preset."
        : "This hides the built-in preset (restorable via 'restore hidden presets').";
    if (!confirm(`Remove "${label}" from the dropdown?\n${detail}`)) return;
    try {
        const data = await fetchJson("/illustrious/resolutions/delete", { label });
        refreshAllNodes(data.options);
    } catch (e) {
        alert(`Failed to delete preset: ${e.message}`);
    }
}

async function restoreHidden() {
    try {
        const data = await fetchJson("/illustrious/resolutions/reset", {});
        refreshAllNodes(data.options);
    } catch (e) {
        alert(`Failed to restore presets: ${e.message}`);
    }
}

app.registerExtension({
    name: "Illustrious.ResolutionPresets",
    beforeRegisterNodeDef(nodeType, nodeData) {
        if (nodeData.name !== NODE_NAME) return;

        const onNodeCreated = nodeType.prototype.onNodeCreated;
        nodeType.prototype.onNodeCreated = function () {
            const result = onNodeCreated?.apply(this, arguments);

            const save = this.addWidget(
                "button",
                "💾 save custom as preset",
                null,
                () => savePreset(this)
            );
            const del = this.addWidget(
                "button",
                "🗑 remove selected preset",
                null,
                () => deletePreset(this)
            );
            save.serialize = false;
            del.serialize = false;

            return result;
        };

        // Right-click menu: restore hidden built-ins
        const getExtraMenuOptions = nodeType.prototype.getExtraMenuOptions;
        nodeType.prototype.getExtraMenuOptions = function (_, menuOptions) {
            getExtraMenuOptions?.apply(this, arguments);
            menuOptions.push(
                {
                    content: "♻ Restore hidden resolution presets",
                    callback: () => restoreHidden(),
                },
                null
            );
        };
    },
});
