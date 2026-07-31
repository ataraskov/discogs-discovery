-- CreateTable
CREATE TABLE "Settings" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT DEFAULT 1,
    "discogsToken" TEXT,
    "discogsUsername" TEXT,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Filter" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "q" TEXT,
    "title" TEXT,
    "releaseTitle" TEXT,
    "artist" TEXT,
    "anv" TEXT,
    "credit" TEXT,
    "label" TEXT,
    "genre" TEXT,
    "style" TEXT,
    "country" TEXT,
    "yearFrom" INTEGER,
    "yearTo" INTEGER,
    "format" TEXT,
    "catno" TEXT,
    "barcode" TEXT,
    "track" TEXT,
    "submitter" TEXT,
    "contributor" TEXT,
    "sort" TEXT,
    "sortOrder" TEXT,
    "maxLowestPrice" REAL,
    "minForSale" INTEGER,
    "nextSearchPage" INTEGER NOT NULL DEFAULT 1
);

-- CreateTable
CREATE TABLE "CandidateQueue" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "filterId" TEXT NOT NULL,
    "releaseId" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "artist" TEXT,
    "year" INTEGER,
    "label" TEXT,
    "format" TEXT,
    "genresJson" TEXT NOT NULL,
    "stylesJson" TEXT NOT NULL,
    "thumbUrl" TEXT,
    "videosJson" TEXT NOT NULL,
    "numForSale" INTEGER,
    "lowestPrice" REAL,
    "lowestPriceCurrency" TEXT,
    "fetchedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CandidateQueue_filterId_fkey" FOREIGN KEY ("filterId") REFERENCES "Filter" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Reviewed" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "releaseId" INTEGER NOT NULL,
    "status" TEXT NOT NULL,
    "filterId" TEXT,
    "reviewedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Reviewed_filterId_fkey" FOREIGN KEY ("filterId") REFERENCES "Filter" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "Filter_name_key" ON "Filter"("name");

-- CreateIndex
CREATE INDEX "CandidateQueue_filterId_fetchedAt_idx" ON "CandidateQueue"("filterId", "fetchedAt");

-- CreateIndex
CREATE UNIQUE INDEX "CandidateQueue_filterId_releaseId_key" ON "CandidateQueue"("filterId", "releaseId");

-- CreateIndex
CREATE UNIQUE INDEX "Reviewed_releaseId_key" ON "Reviewed"("releaseId");
