CREATE TABLE `dismissed_inference_types` (
	`id` int AUTO_INCREMENT NOT NULL,
	`householdId` int NOT NULL,
	`inferenceType` varchar(128) NOT NULL,
	`label` varchar(255) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `dismissed_inference_types_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `events` (
	`id` int AUTO_INCREMENT NOT NULL,
	`householdId` int NOT NULL,
	`title` varchar(512) NOT NULL,
	`description` text,
	`location` varchar(512),
	`startTime` timestamp,
	`endTime` timestamp,
	`subjectName` varchar(128),
	`googleEventIdPrimary` varchar(256),
	`googleEventIdPartner` varchar(256),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `events_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `household_members` (
	`id` int AUTO_INCREMENT NOT NULL,
	`householdId` int NOT NULL,
	`userId` int NOT NULL,
	`displayName` varchar(128) NOT NULL,
	`role` enum('primary','partner') NOT NULL DEFAULT 'primary',
	`googleCalendarToken` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `household_members_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `household_rhythm` (
	`id` int AUTO_INCREMENT NOT NULL,
	`householdId` int NOT NULL,
	`rawText` text NOT NULL,
	`structuredData` json,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `household_rhythm_id` PRIMARY KEY(`id`),
	CONSTRAINT `household_rhythm_householdId_unique` UNIQUE(`householdId`)
);
--> statement-breakpoint
CREATE TABLE `households` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(255) NOT NULL,
	`shareToken` varchar(64) NOT NULL,
	`imbalanceThreshold` float NOT NULL DEFAULT 0.6,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `households_id` PRIMARY KEY(`id`),
	CONSTRAINT `households_shareToken_unique` UNIQUE(`shareToken`)
);
--> statement-breakpoint
CREATE TABLE `routing_rules` (
	`id` int AUTO_INCREMENT NOT NULL,
	`householdId` int NOT NULL,
	`category` varchar(64) NOT NULL,
	`subject` varchar(64),
	`qualifier` varchar(128),
	`assigneeMemberId` int NOT NULL,
	`source` enum('onboarding','learned','manual') NOT NULL DEFAULT 'onboarding',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `routing_rules_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `tasks` (
	`id` int AUTO_INCREMENT NOT NULL,
	`householdId` int NOT NULL,
	`eventId` int,
	`title` varchar(512) NOT NULL,
	`description` text,
	`category` varchar(64) NOT NULL DEFAULT 'general',
	`subject` varchar(64) DEFAULT 'any',
	`qualifier` varchar(128),
	`ownerMemberId` int NOT NULL,
	`status` enum('open','snoozed','done') NOT NULL DEFAULT 'open',
	`deadline` timestamp,
	`urgency` enum('low','medium','high') NOT NULL DEFAULT 'medium',
	`urgencyOverridden` boolean NOT NULL DEFAULT false,
	`isRecurringSuggestion` boolean NOT NULL DEFAULT false,
	`isRecurring` boolean NOT NULL DEFAULT false,
	`lowConfidence` boolean NOT NULL DEFAULT false,
	`googleEventId` varchar(256),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `tasks_id` PRIMARY KEY(`id`)
);
