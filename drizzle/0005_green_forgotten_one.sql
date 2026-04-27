CREATE TABLE `responsibilities` (
	`id` int AUTO_INCREMENT NOT NULL,
	`householdId` int NOT NULL,
	`ownerMemberId` int NOT NULL,
	`title` varchar(512) NOT NULL,
	`category` varchar(64) NOT NULL DEFAULT 'general',
	`source` enum('rhythm','manual') NOT NULL DEFAULT 'manual',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `responsibilities_id` PRIMARY KEY(`id`)
);
