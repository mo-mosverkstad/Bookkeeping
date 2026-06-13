#include "test/test.h"
#include "src/core/arena.h"
#include "src/core/str.h"
#include "src/core/model/table.h"
#include "src/core/parser/csv.h"
#include "src/core/file_io.h"
#include "src/core/control.h"
#include <cstring>
#include <cstdio>
#include <unistd.h>

// ══════════════════════════════════════════════════════════════════════════════
// control.json parsing
// ══════════════════════════════════════════════════════════════════════════════

TEST(control_parse_basic) {
    Arena a = arena_create(16384);
    const char* json = "{\"entries\":[{\"type\":\"table\",\"id\":\"foo\",\"file\":\"Foo.csv\"},{\"type\":\"table\",\"id\":\"bar\",\"file\":\"Bar.csv\"}]}";
    ControlFile cf = control_parse(&a, json, strlen(json));
    ASSERT_EQ(cf.count, (uint16_t)2);
    ASSERT_TRUE(strcmp(cf.entries[0].type, "table") == 0);
    ASSERT_TRUE(strcmp(cf.entries[0].id, "foo") == 0);
    ASSERT_TRUE(strcmp(cf.entries[0].file, "Foo.csv") == 0);
    ASSERT_TRUE(strcmp(cf.entries[1].id, "bar") == 0);
    arena_destroy(&a);
}

TEST(control_parse_with_whitespace) {
    Arena a = arena_create(16384);
    const char* json = "{\n  \"entries\": [\n    { \"type\": \"table\", \"id\": \"x\", \"file\": \"X.csv\" }\n  ]\n}";
    ControlFile cf = control_parse(&a, json, strlen(json));
    ASSERT_EQ(cf.count, (uint16_t)1);
    ASSERT_TRUE(strcmp(cf.entries[0].id, "x") == 0);
    ASSERT_TRUE(strcmp(cf.entries[0].file, "X.csv") == 0);
    arena_destroy(&a);
}

TEST(control_parse_empty) {
    Arena a = arena_create(8192);
    const char* json = "{\"entries\":[]}";
    ControlFile cf = control_parse(&a, json, strlen(json));
    ASSERT_EQ(cf.count, (uint16_t)0);
    arena_destroy(&a);
}

// ══════════════════════════════════════════════════════════════════════════════
// Folder loading
// ══════════════════════════════════════════════════════════════════════════════

TEST(folder_load_with_control) {
    // Create temp folder structure
    if(system("mkdir -p /tmp/bk_folder_test")){}
    file_write("/tmp/bk_folder_test/control.json",
        "{\"entries\":[{\"type\":\"table\",\"id\":\"t1\",\"file\":\"data.csv\"}]}",
        strlen("{\"entries\":[{\"type\":\"table\",\"id\":\"t1\",\"file\":\"data.csv\"}]}"));
    file_write("/tmp/bk_folder_test/data.csv", "A,B\ntext,text\n1,2\n3,4", 21);

    Arena a = arena_create(32768);
    LoadedFolder lf = folder_load(&a, "/tmp/bk_folder_test");
    ASSERT_TRUE(strcmp(lf.name, "bk_folder_test") == 0);
    ASSERT_EQ(lf.table_count, (uint16_t)1);
    ASSERT_TRUE(strcmp(lf.table_ids[0], "t1") == 0);
    ASSERT_EQ(lf.tables[0]->row_count, (uint32_t)2);
    ASSERT_EQ(lf.tables[0]->col_count, (uint16_t)2);
    arena_destroy(&a);
    if(system("rm -rf /tmp/bk_folder_test")){}
}

TEST(folder_load_real_testresources) {
    Arena a = arena_create(4 * 1024 * 1024);
    LoadedFolder lf = folder_load(&a, "/mnt/c/Users/EWANBIN/OneDrive - Ericsson/misc/backup2/Sanders.Wang/github/Bookkeeping/Webapp/testresources/Mathematics reference sheet");
    ASSERT_TRUE(lf.table_count > 0);
    printf("    Loaded %u tables from Mathematics reference sheet\n", lf.table_count);
    ASSERT_TRUE(lf.tables[0]->row_count > 0);
    arena_destroy(&a);
}

TEST(folder_load_chemistry) {
    Arena a = arena_create(8 * 1024 * 1024);
    LoadedFolder lf = folder_load(&a, "/mnt/c/Users/EWANBIN/OneDrive - Ericsson/misc/backup2/Sanders.Wang/github/Bookkeeping/Webapp/testresources/Chemistry reference sheet");
    ASSERT_TRUE(lf.table_count > 0);
    printf("    Loaded %u tables from Chemistry reference sheet\n", lf.table_count);
    arena_destroy(&a);
}

TEST(folder_load_software) {
    Arena a = arena_create(8 * 1024 * 1024);
    LoadedFolder lf = folder_load(&a, "/mnt/c/Users/EWANBIN/OneDrive - Ericsson/misc/backup2/Sanders.Wang/github/Bookkeeping/Webapp/testresources/Software reference sheet");
    ASSERT_TRUE(lf.table_count > 0);
    printf("    Loaded %u tables from Software reference sheet\n", lf.table_count);
    arena_destroy(&a);
}

// ══════════════════════════════════════════════════════════════════════════════

int main() {
    return run_all_tests();
}
