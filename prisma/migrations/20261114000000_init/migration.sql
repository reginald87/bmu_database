-- CreateTable
CREATE TABLE `Setting` (
    `key` VARCHAR(191) NOT NULL,
    `value` TEXT NOT NULL,

    PRIMARY KEY (`key`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Campus` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `location` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `User` (
    `id` VARCHAR(191) NOT NULL,
    `username` VARCHAR(191) NOT NULL,
    `email` VARCHAR(191) NULL,
    `displayName` VARCHAR(191) NOT NULL,
    `role` VARCHAR(191) NOT NULL,
    `campuses` VARCHAR(191) NOT NULL DEFAULT '[]',
    `passwordHash` VARCHAR(191) NULL,
    `salt` VARCHAR(191) NULL,
    `inviteTokenHash` VARCHAR(191) NULL,
    `inviteExpiresAt` DATETIME(3) NULL,
    `active` BOOLEAN NOT NULL DEFAULT false,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `User_username_key`(`username`),
    UNIQUE INDEX `User_email_key`(`email`),
    INDEX `User_role_active_idx`(`role`, `active`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Session` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `csrfToken` VARCHAR(191) NOT NULL,
    `expiresAt` DATETIME(3) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `Session_userId_idx`(`userId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `AcademicSession` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `startDate` VARCHAR(191) NULL,
    `endDate` VARCHAR(191) NULL,
    `isCurrent` BOOLEAN NOT NULL DEFAULT false,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `AcademicSession_name_key`(`name`),
    INDEX `AcademicSession_isCurrent_idx`(`isCurrent`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Person` (
    `id` VARCHAR(191) NOT NULL,
    `universityId` VARCHAR(191) NOT NULL,
    `bimsNumber` VARCHAR(191) NULL,
    `firstName` VARCHAR(191) NOT NULL,
    `middleName` VARCHAR(191) NULL,
    `lastName` VARCHAR(191) NOT NULL,
    `preferredName` VARCHAR(191) NULL,
    `email` VARCHAR(191) NULL,
    `phone` VARCHAR(191) NULL,
    `dateOfBirth` VARCHAR(191) NULL,
    `gender` VARCHAR(191) NULL,
    `nationality` VARCHAR(191) NULL,
    `address` TEXT NULL,
    `city` VARCHAR(191) NULL,
    `lga` VARCHAR(191) NULL,
    `state` VARCHAR(191) NULL,
    `emergencyContact` VARCHAR(191) NULL,
    `emergencyName` VARCHAR(191) NULL,
    `emergencyRelationship` VARCHAR(191) NULL,
    `emergencyPhone` VARCHAR(191) NULL,
    `emergencyEmail` VARCHAR(191) NULL,
    `nextOfKin` VARCHAR(191) NULL,
    `guardianName` VARCHAR(191) NULL,
    `guardianRelationship` VARCHAR(191) NULL,
    `guardianPhone` VARCHAR(191) NULL,
    `guardianEmail` VARCHAR(191) NULL,
    `campusId` VARCHAR(191) NOT NULL,
    `recordType` VARCHAR(191) NOT NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'Needs review',
    `completeness` INTEGER NOT NULL DEFAULT 70,
    `photo` LONGTEXT NULL,
    `programme` VARCHAR(191) NULL,
    `faculty` VARCHAR(191) NULL,
    `department` VARCHAR(191) NULL,
    `currentLevel` VARCHAR(191) NULL,
    `programmeLevel` VARCHAR(191) NULL,
    `admissionSession` VARCHAR(191) NULL,
    `entryRoute` VARCHAR(191) NULL,
    `admissionDate` VARCHAR(191) NULL,
    `enrollmentStatus` VARCHAR(191) NULL,
    `previousInstitution` VARCHAR(191) NULL,
    `priorQualification` VARCHAR(191) NULL,
    `priorYearCompleted` VARCHAR(191) NULL,
    `staffCategory` VARCHAR(191) NULL,
    `jobTitle` VARCHAR(191) NULL,
    `appointmentType` VARCHAR(191) NULL,
    `employmentType` VARCHAR(191) NULL,
    `salaryGrade` VARCHAR(191) NULL,
    `appointmentDate` VARCHAR(191) NULL,
    `employmentStatus` VARCHAR(191) NULL,
    `gradeLevel` VARCHAR(191) NULL,
    `highestQualification` VARCHAR(191) NULL,
    `qualificationField` VARCHAR(191) NULL,
    `qualificationInstitution` VARCHAR(191) NULL,
    `qualificationYear` VARCHAR(191) NULL,
    `professionalBody` VARCHAR(191) NULL,
    `professionalBodies` TEXT NOT NULL,
    `professionalRegistration` VARCHAR(191) NULL,
    `supervisor` VARCHAR(191) NULL,
    `education` TEXT NOT NULL,
    `history` TEXT NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `Person_universityId_key`(`universityId`),
    UNIQUE INDEX `Person_bimsNumber_key`(`bimsNumber`),
    INDEX `Person_lastName_firstName_idx`(`lastName`, `firstName`),
    INDEX `Person_campusId_status_idx`(`campusId`, `status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Document` (
    `id` VARCHAR(191) NOT NULL,
    `personId` VARCHAR(191) NOT NULL,
    `title` VARCHAR(191) NOT NULL,
    `filename` VARCHAR(191) NOT NULL,
    `classification` VARCHAR(191) NOT NULL,
    `type` VARCHAR(191) NOT NULL,
    `mimeType` VARCHAR(191) NOT NULL,
    `size` VARCHAR(191) NOT NULL,
    `sizeBytes` INTEGER NOT NULL DEFAULT 0,
    `storageKey` VARCHAR(191) NULL,
    `scanStatus` VARCHAR(191) NULL,
    `scanner` VARCHAR(191) NULL,
    `scannedAt` VARCHAR(191) NULL,
    `expiryDate` VARCHAR(191) NULL,
    `added` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `Document_storageKey_key`(`storageKey`),
    INDEX `Document_personId_idx`(`personId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ReviewItem` (
    `id` VARCHAR(191) NOT NULL,
    `personId` VARCHAR(191) NULL,
    `name` VARCHAR(191) NOT NULL,
    `recordId` VARCHAR(191) NOT NULL,
    `group` VARCHAR(191) NOT NULL,
    `issue` TEXT NOT NULL,
    `campusId` VARCHAR(191) NOT NULL,
    `submitted` VARCHAR(191) NOT NULL,
    `priority` VARCHAR(191) NOT NULL DEFAULT 'Normal',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `ReviewItem_campusId_idx`(`campusId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `AuditEvent` (
    `id` VARCHAR(191) NOT NULL,
    `action` VARCHAR(191) NOT NULL,
    `record` TEXT NOT NULL,
    `actor` VARCHAR(191) NOT NULL,
    `campusId` VARCHAR(191) NULL,
    `when` VARCHAR(191) NOT NULL,
    `ref` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `AuditEvent_campusId_createdAt_idx`(`campusId`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Notification` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NULL,
    `roles` VARCHAR(191) NOT NULL DEFAULT '[]',
    `campusId` VARCHAR(191) NULL,
    `title` VARCHAR(191) NOT NULL,
    `message` TEXT NOT NULL,
    `href` VARCHAR(191) NULL,
    `readBy` VARCHAR(191) NOT NULL DEFAULT '[]',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `Notification_createdAt_idx`(`createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `Session` ADD CONSTRAINT `Session_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Person` ADD CONSTRAINT `Person_campusId_fkey` FOREIGN KEY (`campusId`) REFERENCES `Campus`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Document` ADD CONSTRAINT `Document_personId_fkey` FOREIGN KEY (`personId`) REFERENCES `Person`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ReviewItem` ADD CONSTRAINT `ReviewItem_personId_fkey` FOREIGN KEY (`personId`) REFERENCES `Person`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
