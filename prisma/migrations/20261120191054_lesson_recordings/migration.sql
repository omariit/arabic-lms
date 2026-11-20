-- CreateEnum
CREATE TYPE "RecordingStatus" AS ENUM ('RECORDING', 'UPLOADING', 'PROCESSING', 'READY', 'FAILED', 'ABORTED', 'EXPIRED');

-- CreateTable
CREATE TABLE "RecordingSession" (
    "id" TEXT NOT NULL,
    "serviceId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "teacherId" TEXT NOT NULL,
    "courseId" TEXT,
    "lessonId" TEXT,
    "status" "RecordingStatus" NOT NULL DEFAULT 'RECORDING',
    "stage" TEXT NOT NULL DEFAULT 'created',
    "progress" INTEGER NOT NULL DEFAULT 0,
    "chunkCount" INTEGER NOT NULL DEFAULT 0,
    "bytesReceived" INTEGER NOT NULL DEFAULT 0,
    "durationSec" INTEGER,
    "sizeBytes" INTEGER,
    "hasVideo" BOOLEAN NOT NULL DEFAULT false,
    "errorMessage" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finalizedAt" TIMESTAMP(3),
    "readyAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RecordingSession_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "RecordingSession_serviceId_key" ON "RecordingSession"("serviceId");

-- CreateIndex
CREATE UNIQUE INDEX "RecordingSession_lessonId_key" ON "RecordingSession"("lessonId");

-- CreateIndex
CREATE INDEX "RecordingSession_status_idx" ON "RecordingSession"("status");

-- CreateIndex
CREATE INDEX "RecordingSession_teacherId_startedAt_idx" ON "RecordingSession"("teacherId", "startedAt");

-- CreateIndex
CREATE INDEX "RecordingSession_lessonId_idx" ON "RecordingSession"("lessonId");

-- AddForeignKey
ALTER TABLE "RecordingSession" ADD CONSTRAINT "RecordingSession_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecordingSession" ADD CONSTRAINT "RecordingSession_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecordingSession" ADD CONSTRAINT "RecordingSession_lessonId_fkey" FOREIGN KEY ("lessonId") REFERENCES "Lesson"("id") ON DELETE SET NULL ON UPDATE CASCADE;
