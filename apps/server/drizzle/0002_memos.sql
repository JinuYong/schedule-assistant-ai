CREATE TABLE `memo_properties` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`user_id` bigint unsigned NOT NULL,
	`name` varchar(100) NOT NULL,
	`type` enum('text','number','select','multiSelect','date','checkbox','url') NOT NULL,
	`options` json NOT NULL,
	`created_at` datetime(3) NOT NULL,
	CONSTRAINT `memo_properties_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `memos` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`user_id` bigint unsigned NOT NULL,
	`title` varchar(500) NOT NULL DEFAULT '',
	`content` json NOT NULL,
	`content_text` mediumtext NOT NULL,
	`property_values` json NOT NULL,
	`created_at` datetime(3) NOT NULL,
	`updated_at` datetime(3) NOT NULL,
	CONSTRAINT `memos_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `memo_properties` ADD CONSTRAINT `memo_properties_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `memos` ADD CONSTRAINT `memos_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `memo_properties_user_id_idx` ON `memo_properties` (`user_id`);--> statement-breakpoint
CREATE INDEX `memos_user_updated_idx` ON `memos` (`user_id`,`updated_at`);