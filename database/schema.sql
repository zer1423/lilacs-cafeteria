-- Lilac's Cafeteria: schema.sql
-- Matches the ER diagram and data dictionary. Requires MySQL 8.0.16+ or MariaDB 10.2.1+
-- (older versions silently ignore CHECK, so the backend validates too).
-- Run this first, then seed.sql.

CREATE DATABASE IF NOT EXISTS lilacs_cafeteria
  CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE lilacs_cafeteria;

-- Drop in child-to-parent order so foreign keys do not block it
DROP TABLE IF EXISTS order_item;
DROP TABLE IF EXISTS orders;
DROP TABLE IF EXISTS menu_item;
DROP TABLE IF EXISTS category;
DROP TABLE IF EXISTS admin_user;
DROP TABLE IF EXISTS business_info;

CREATE TABLE category (
  category_id   INT          NOT NULL AUTO_INCREMENT,
  name          VARCHAR(50)  NOT NULL,
  display_name  VARCHAR(100) NOT NULL,
  -- 1 = every unit of an item in this category adds the takeout fee (meals)
  -- 0 = exempt from the takeout fee (drinks, pastries, rice & extras)
  has_takeout_fee BOOLEAN    NOT NULL DEFAULT 0,
  PRIMARY KEY (category_id),
  CONSTRAINT uq_category_name UNIQUE (name)
) ENGINE=InnoDB;

CREATE TABLE menu_item (
  item_id       INT           NOT NULL AUTO_INCREMENT,
  category_id   INT           NOT NULL,
  name          VARCHAR(100)  NOT NULL,
  description   TEXT          NULL,
  price         DECIMAL(10,2) NOT NULL,
  image_url     VARCHAR(255)  NULL,
  is_available  BOOLEAN       NOT NULL DEFAULT 1,
  PRIMARY KEY (item_id),
  CONSTRAINT chk_menu_item_price CHECK (price >= 0),
  CONSTRAINT fk_menu_item_category
    FOREIGN KEY (category_id) REFERENCES category (category_id)
    ON DELETE RESTRICT
) ENGINE=InnoDB;

CREATE TABLE orders (
  order_id        INT           NOT NULL AUTO_INCREMENT,
  customer_name   VARCHAR(100)  NOT NULL,
  order_datetime  DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  status          ENUM('pending','preparing','ready_for_pickup','picked_up','cancelled')
                                NOT NULL DEFAULT 'pending',
  phone           VARCHAR(20)   NOT NULL,
  email           VARCHAR(100)  NULL,
  notes           VARCHAR(255)  NULL,
  subtotal        DECIMAL(10,2) NOT NULL,
  takeout_fee     DECIMAL(10,2) NOT NULL DEFAULT 0,
  total           DECIMAL(10,2) NOT NULL,
  -- payment_method defaults to 'qrph' (QR Ph), the only way to pay, so inserts can leave it out.
  -- payment_reference is the
  -- reference number the customer types after paying; the admin checks it against
  -- the incoming payment. It must be unique so one payment cannot back two orders.
  payment_method  VARCHAR(30)   NOT NULL DEFAULT 'qrph',
  payment_reference VARCHAR(50) NOT NULL,
  time_of_pickup  DATETIME      NOT NULL,
  PRIMARY KEY (order_id),
  CONSTRAINT uq_orders_payment_reference UNIQUE (payment_reference),
  CONSTRAINT chk_orders_subtotal   CHECK (subtotal >= 0),
  CONSTRAINT chk_orders_takeout_fee CHECK (takeout_fee >= 0),
  CONSTRAINT chk_orders_total      CHECK (total >= 0)
) ENGINE=InnoDB;

CREATE TABLE order_item (
  order_item_id INT           NOT NULL AUTO_INCREMENT,
  item_id       INT           NOT NULL,
  order_id      INT           NOT NULL,
  quantity      INT           NOT NULL,
  unit_price    DECIMAL(10,2) NOT NULL,
  PRIMARY KEY (order_item_id),
  CONSTRAINT uq_order_item UNIQUE (order_id, item_id),
  CONSTRAINT chk_order_item_quantity   CHECK (quantity > 0),
  CONSTRAINT chk_order_item_unit_price CHECK (unit_price >= 0),
  CONSTRAINT fk_order_item_menu_item
    FOREIGN KEY (item_id) REFERENCES menu_item (item_id)
    ON DELETE RESTRICT,
  -- RESTRICT matches the data dictionary. The backend deletes a cancelled order's
  -- line items first, inside a transaction, then the order itself.
  CONSTRAINT fk_order_item_orders
    FOREIGN KEY (order_id) REFERENCES orders (order_id)
    ON DELETE RESTRICT
) ENGINE=InnoDB;

CREATE TABLE admin_user (
  admin_id       INT          NOT NULL AUTO_INCREMENT,
  username       VARCHAR(50)  NOT NULL,
  password_hash  VARCHAR(255) NOT NULL,
  PRIMARY KEY (admin_id),
  CONSTRAINT uq_admin_username UNIQUE (username)
) ENGINE=InnoDB;

-- Single-row table: the only valid business_id is 1
CREATE TABLE business_info (
  business_id  INT           NOT NULL,
  name         VARCHAR(100)  NOT NULL,
  tagline      VARCHAR(150)  NULL,
  address      VARCHAR(255)  NOT NULL,
  city         VARCHAR(100)  NOT NULL,
  map_link     VARCHAR(500)  NULL,
  phone        VARCHAR(20)   NOT NULL,
  takeout_fee_per_meal DECIMAL(10,2) NOT NULL DEFAULT 0,
  PRIMARY KEY (business_id),
  CONSTRAINT chk_business_single_row CHECK (business_id = 1),
  CONSTRAINT chk_business_takeout_fee CHECK (takeout_fee_per_meal >= 0)
) ENGINE=InnoDB;
