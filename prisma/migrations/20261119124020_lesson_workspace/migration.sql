-- AlterTable
ALTER TABLE "Course" ADD COLUMN     "weeklyMeetings" TEXT NOT NULL DEFAULT '';

-- AlterTable
ALTER TABLE "Lesson" ADD COLUMN     "assignmentInstructions" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "assignmentTitle" TEXT,
ADD COLUMN     "description" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "scriptText" TEXT NOT NULL DEFAULT '';

-- CreateTable
CREATE TABLE "LessonThread" (
    "id" TEXT NOT NULL,
    "lessonId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "staffUnread" INTEGER NOT NULL DEFAULT 0,
    "studentUnread" INTEGER NOT NULL DEFAULT 0,
    "assignedToId" TEXT,
    "lastMessageAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LessonThread_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LessonMessage" (
    "id" TEXT NOT NULL,
    "threadId" TEXT NOT NULL,
    "senderId" TEXT NOT NULL,
    "senderRole" "Role" NOT NULL,
    "body" TEXT NOT NULL,
    "audioKey" TEXT,
    "audioMime" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LessonMessage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LessonThread_lessonId_lastMessageAt_idx" ON "LessonThread"("lessonId", "lastMessageAt");

-- CreateIndex
CREATE UNIQUE INDEX "LessonThread_lessonId_studentId_key" ON "LessonThread"("lessonId", "studentId");

-- CreateIndex
CREATE INDEX "LessonMessage_threadId_createdAt_idx" ON "LessonMessage"("threadId", "createdAt");

-- AddForeignKey
ALTER TABLE "LessonThread" ADD CONSTRAINT "LessonThread_lessonId_fkey" FOREIGN KEY ("lessonId") REFERENCES "Lesson"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LessonThread" ADD CONSTRAINT "LessonThread_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LessonMessage" ADD CONSTRAINT "LessonMessage_threadId_fkey" FOREIGN KEY ("threadId") REFERENCES "LessonThread"("id") ON DELETE CASCADE ON UPDATE CASCADE;
