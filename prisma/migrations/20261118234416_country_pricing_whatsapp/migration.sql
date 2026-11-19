-- AlterTable
ALTER TABLE "TeacherProfile" ADD COLUMN     "whatsappNumber" TEXT;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "countryCode" TEXT NOT NULL DEFAULT 'JO';

-- CreateTable
CREATE TABLE "CoursePrice" (
    "id" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "countryCode" TEXT NOT NULL,
    "price" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CoursePrice_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CoursePrice_countryCode_idx" ON "CoursePrice"("countryCode");

-- CreateIndex
CREATE UNIQUE INDEX "CoursePrice_courseId_countryCode_key" ON "CoursePrice"("courseId", "countryCode");

-- AddForeignKey
ALTER TABLE "CoursePrice" ADD CONSTRAINT "CoursePrice_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE CASCADE ON UPDATE CASCADE;
