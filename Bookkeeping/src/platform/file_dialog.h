#pragma once
#include <cstdio>
#include <cstring>

// ── File/Folder picker using platform-native dialog ──────────────────────────
// On WSL: uses PowerShell's FolderBrowserDialog
// On native Linux: uses zenity (install with: sudo apt install zenity)
// Returns path in buf, or empty string if cancelled.

inline bool pick_folder(char* buf, int buf_size) {
    buf[0] = 0;

    // Simple approach: prompt user in the terminal
    printf("\n=== OPEN FOLDER ===\n");
    printf("Enter folder path (or press Enter to cancel): ");
    fflush(stdout);
    if (fgets(buf, buf_size, stdin)) {
        int len = (int)strlen(buf);
        while (len > 0 && (buf[len-1] == '\n' || buf[len-1] == '\r' || buf[len-1] == ' '))
            buf[--len] = 0;
        if (len > 0) return true;
    }
    buf[0] = 0;
    return false;
}
