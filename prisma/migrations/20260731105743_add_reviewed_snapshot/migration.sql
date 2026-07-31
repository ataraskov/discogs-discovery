/*
  Warnings:

  - Added the required column `title` to the `Reviewed` table without a default value. This is not possible if the table is not empty.

*/
-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Reviewed" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "releaseId" INTEGER NOT NULL,
    "status" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "artist" TEXT,
    "thumbUrl" TEXT,
    "filterId" TEXT,
    "reviewedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Reviewed_filterId_fkey" FOREIGN KEY ("filterId") REFERENCES "Filter" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Reviewed" ("filterId", "id", "releaseId", "reviewedAt", "status") SELECT "filterId", "id", "releaseId", "reviewedAt", "status" FROM "Reviewed";
DROP TABLE "Reviewed";
ALTER TABLE "new_Reviewed" RENAME TO "Reviewed";
CREATE UNIQUE INDEX "Reviewed_releaseId_key" ON "Reviewed"("releaseId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
