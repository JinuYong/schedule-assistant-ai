CREATE TABLE `sessions` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`user_id` bigint unsigned NOT NULL,
	`token_hash` char(64) NOT NULL,
	`created_at` datetime(3) NOT NULL,
	`last_used_at` datetime(3) NOT NULL,
	`expires_at` datetime(3) NOT NULL,
	CONSTRAINT `sessions_id` PRIMARY KEY(`id`),
	CONSTRAINT `sessions_tokenHash_unique` UNIQUE(`token_hash`)
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`google_sub` varchar(255) NOT NULL,
	`email` varchar(320) NOT NULL,
	`name` varchar(200),
	`picture_url` varchar(2048),
	`created_at` datetime(3) NOT NULL,
	`last_login_at` datetime(3) NOT NULL,
	CONSTRAINT `users_id` PRIMARY KEY(`id`),
	CONSTRAINT `users_googleSub_unique` UNIQUE(`google_sub`)
);
--> statement-breakpoint
ALTER TABLE `sessions` ADD CONSTRAINT `sessions_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `sessions_user_id_idx` ON `sessions` (`user_id`);