#pragma once
#include "src/core/arena.h"
#include "src/graphics/ui.h"
#include "src/core/theme.h"
#include <cstdio>
#include <cstring>
#include <dirent.h>
#include <sys/stat.h>

// ══════════════════════════════════════════════════════════════════════════════
// In-app file browser — draws a directory listing overlay
// ══════════════════════════════════════════════════════════════════════════════

struct FileBrowserEntry {
    char name[128];
    bool is_dir;
};

struct FileBrowser {
    char current_path[512];
    FileBrowserEntry entries[128];
    uint16_t entry_count;
    bool visible;
    float scroll_y;

    void init(const char* start_path) {
        visible = false;
        scroll_y = 0;
        strncpy(current_path, start_path, 511);
        current_path[511] = 0;
        entry_count = 0;
    }

    void open() {
        visible = true;
        scroll_y = 0;
        scan();
    }

    void close() { visible = false; }

    void scan() {
        entry_count = 0;
        DIR* dir = opendir(current_path);
        if (!dir) return;

        // Add parent directory entry
        if (strlen(current_path) > 1) {
            strncpy(entries[entry_count].name, "..", 127);
            entries[entry_count].is_dir = true;
            entry_count++;
        }

        struct dirent* ent;
        while ((ent = readdir(dir)) && entry_count < 128) {
            if (ent->d_name[0] == '.') continue; // skip hidden
            strncpy(entries[entry_count].name, ent->d_name, 127);
            entries[entry_count].name[127] = 0;

            char full[640];
            snprintf(full, 640, "%s/%s", current_path, ent->d_name);
            struct stat st;
            entries[entry_count].is_dir = (stat(full, &st) == 0 && S_ISDIR(st.st_mode));
            entry_count++;
        }
        closedir(dir);

        // Sort: dirs first, then files
        for (uint16_t i = 1; i < entry_count; i++) {
            FileBrowserEntry tmp = entries[i];
            uint16_t j = i;
            while (j > 0 && !entries[j-1].is_dir && tmp.is_dir) {
                entries[j] = entries[j-1]; j--;
            }
            entries[j] = tmp;
        }
    }

    void navigate(const char* name) {
        if (strcmp(name, "..") == 0) {
            // Go up
            char* last = strrchr(current_path, '/');
            if (last && last != current_path) *last = 0;
            else if (last) *(last+1) = 0;
        } else {
            char tmp[512];
            snprintf(tmp, 512, "%s/%s", current_path, name);
            strncpy(current_path, tmp, 511);
        }
        scroll_y = 0;
        scan();
    }

    // Returns selected folder path when user clicks "Open Here", or nullptr
    const char* get_path() const { return current_path; }
};

// ── Build file browser overlay ───────────────────────────────────────────────

inline LayoutNode* file_browser_build(Arena* a, FileBrowser* fb, float win_w, float win_h, Theme& th) {
    float panel_w = win_w * 0.6f;
    float panel_h = win_h * 0.7f;
    float panel_x = (win_w - panel_w) / 2;
    float panel_y = (win_h - panel_h) / 2;

    Node* root = node_coord(a);
    root->size(win_w, win_h).set_id("file-browser-overlay");

    // Dim background
    root->attach(make_elements(a, 1), 1);
    root->elements[0] = elem_rect({0, 0, win_w, win_h, {0,0,0,120}, COLOR_TRANSPARENT, 0, 0});

    // Panel
    auto panel = VStack(a, 0).size(panel_w, panel_h).id("fb-panel")
        .bg(th.surface, th.border, 2);

    // Header with path + close button
    char* hdr = (char*)arena_alloc(a, 520, 1);
    snprintf(hdr, 520, " %s", fb->current_path);
    auto header = HStack(a, 4).size(panel_w, 32).bg(th.accent_light, th.border, 1);
    header.child(Box(a, panel_w - 80, 30).text(hdr, th.font_small, th.text));
    header.child(Box(a, 60, 28).id("fb-open-here").bg(th.surface, th.cell_active_outline, 1).text("Open", th.font_small, th.text));
    header.child(Box(a, 14, 28).id("fb-close").text("x", th.font_small, th.error_text));
    panel.child(std::move(header));

    // File list in scroll
    auto list = VStack(a, 1).size(panel_w, 0);
    for (uint16_t i = 0; i < fb->entry_count; i++) {
        char* entry_id = (char*)arena_alloc(a, 140, 1);
        snprintf(entry_id, 140, "fb-%u", i);
        const char* icon = fb->entries[i].is_dir ? "\xf0\x9f\x93\x81 " : "  "; // 📁 or space
        char* label = (char*)arena_alloc(a, 140, 1);
        snprintf(label, 140, "%s%s", icon, fb->entries[i].name);
        Color txt = fb->entries[i].is_dir ? th.text : th.text_secondary;
        list.child(Box(a, panel_w - 4, 24).id(entry_id).text(label, th.font_small, txt));
    }

    LayoutNode* list_node = build(list);
    Node* scroll = node_scroll(a, panel_w, panel_h - 36);
    scroll->set_id("fb-scroll");
    scroll->scroll_y = fb->scroll_y;
    auto sk = make_children(a, 1);
    sk[0] = list_node;
    scroll->set_children(sk, 1);
    panel.child(UI{*(LayoutNode*)scroll, a});

    LayoutNode* panel_node = build(panel);
    panel_node->x = panel_x;
    panel_node->y = panel_y;

    auto kids = make_children(a, 1);
    kids[0] = panel_node;
    root->set_children(kids, 1);
    return root;
}
