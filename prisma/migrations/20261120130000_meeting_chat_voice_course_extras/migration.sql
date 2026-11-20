-- CreateEnum
CREATE TYPE "RoomMode" AS ENUM ('CLASSROOM', 'MEETING');

-- AlterTable
ALTER TABLE "Course" ADD COLUMN     "coverImageKey" TEXT,
ADD COLUMN     "outcomes" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "requirements" TEXT NOT NULL DEFAULT '';

-- AlterTable
ALTER TABLE "LiveSession" ADD COLUMN     "guestAllowed" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "inviteToken" TEXT,
ADD COLUMN     "maxSeats" INTEGER NOT NULL DEFAULT 12,
ADD COLUMN     "mode" "RoomMode" NOT NULL DEFAULT 'CLASSROOM';

-- AlterTable
ALTER TABLE "Message" ADD COLUMN     "audioKey" TEXT,
ADD COLUMN     "audioMime" TEXT;

-- CreateTable
CREATE TABLE "LessonResource" (
    "id" TEXT NOT NULL,
    "lessonId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "fileKey" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "size" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LessonResource_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LiveMessage" (
    "id" TEXT NOT NULL,
    "liveSessionId" TEXT NOT NULL,
    "authorName" TEXT NOT NULL,
    "authorRole" "Role",
    "body" TEXT NOT NULL DEFAULT '',
    "audioKey" TEXT,
    "audioMime" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LiveMessage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LessonResource_lessonId_idx" ON "LessonResource"("lessonId");

-- CreateIndex
CREATE INDEX "LiveMessage_liveSessionId_createdAt_idx" ON "LiveMessage"("liveSessionId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "LiveSession_inviteToken_key" ON "LiveSession"("inviteToken");

-- AddForeignKey
ALTER TABLE "LessonResource" ADD CONSTRAINT "LessonResource_lessonId_fkey" FOREIGN KEY ("lessonId") REFERENCES "Lesson"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LiveMessage" ADD CONSTRAINT "LiveMessage_liveSessionId_fkey" FOREIGN KEY ("liveSessionId") REFERENCES "LiveSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

