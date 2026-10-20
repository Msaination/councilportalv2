ALTER TABLE `#__phocadownload_logging` CHANGE `page` `page` TEXT;
ALTER TABLE `#__phocadownload_categories` ADD COLUMN `archived_description` TEXT AFTER `description`;
