---
id: AN-002
title: What an .mbz actually contains (facts + interpretation)
date: 2026-08-24
sources: [REPO-005, REPO-004]
ai_tool: opencode
ai_model: ox-alpha
---
## FACTS
1. Container: ZIP or TAR.GZ. tgz default since Moodle 2.9; ZIP lacks ZIP64 in
   Moodle itself (4 GB cap era). Real-world small backups may still be tgz —
   verified on REPO-004 PRDV103 (43 KB, gzip magic).
2. Archive root: moodle_backup.xml, files.xml, plus per-entity dirs:
   course/, sections/section_<id>/, activities/<mod>_<id>/.
3. moodle_backup.xml <information><contents> holds the tree skeleton:
   - course: courseid/title/directory only;
   - sections/section: sectionid/title/directory;
   - activities/activity: moduleid/sectionid/modulename/title/directory.
   Rich course fields (fullname, shortname, summary, startdate) live in
   course/course.xml. Section number/name/summary/order live in
   sections/section_N/section.xml; <sequence> lists module ids in order.
4. files.xml entries carry contenthash/component/filearea/itemid/filepath/
   filename/filesize/mimetype… with literal `$@NULL@$` for SQL NULL.
5. Binary payloads stored once at files/<2 hex of sha1>/<sha1>.

## INTERPRETATION
Minimum set to render a navigation tree = moodle_backup.xml + section.xml files
(+ course/course.xml for display name). files.xml can be indexed lazily.
Q-002 remains open until more course formats are tested (flexsections observed
in REPO-004 shows empty sequence cases).
