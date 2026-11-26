-- Lilac's Cafeteria: seed.sql
-- Run AFTER schema.sql (it relies on empty tables so the category ids start at 1).
-- Menu and contact details come from the owner's menu sheet.
-- There is no admin here: create the first one with scripts/create-admin.js.

USE lilacs_cafeteria;

-- ---------------------------------------------------------------
-- business_info (single row, business_id must be 1)
-- ---------------------------------------------------------------
-- No tax: menu prices are final. Takeout orders add takeout_fee_per_meal (10.00)
-- for every unit of an item whose category has has_takeout_fee = 1.
-- TODO: tagline is not provided yet (NULL).
INSERT INTO business_info
  (business_id, name, tagline, address, city, map_link, phone, takeout_fee_per_meal)
VALUES
  (1, 'Lilac''s Cafeteria', NULL,
   '35 A Lower Kalaklan, Zambales (In Front of Celtech College), 2200',
   'Olongapo',
   'https://www.google.com/maps/place/Lilacs+Cafeteria/@14.8362562,120.2755242,17z/data=!3m1!4b1!4m6!3m5!1s0x3396798974f049cb:0x8193fbf0f2c44569!8m2!3d14.836251!4d120.2781045!16s%2Fg%2F11p2dj89tc',
   '0917 592 0609', 10.00);

-- ---------------------------------------------------------------
-- category (ids follow the order shown on the printed menu)
-- has_takeout_fee: 1 for the three meal categories; 0 for Drinks and the extras.
-- Pastries are treated as extras (the menu sheet lists them under "Drinks & Extras").
-- ---------------------------------------------------------------
INSERT INTO category (category_id, name, display_name, has_takeout_fee) VALUES
  (1, 'sizzling_specials',  'Sizzling Specials',  1),
  (2, 'tapsilog_favorites', 'Tapsilog Favorites', 1),
  (3, 'student_meal',       'Student Meal',       1),
  (4, 'drinks',             'Drinks',             0),
  (5, 'pastries',           'Pastries',           0),
  (6, 'rice_extras',        'Rice & Extras',      0);

-- ---------------------------------------------------------------
-- menu_item (image_url is set by the UPDATE block at the end; items without a photo stay NULL)
-- ---------------------------------------------------------------

-- 1: Sizzling Specials (served with java rice and soup)
INSERT INTO menu_item (category_id, name, description, price) VALUES
  (1, 'Sizzling Sisig',         'Served with java rice and soup.', 129.00),
  (1, 'Sizzling Chicken',       'Served with java rice and soup.', 129.00),
  (1, 'Sizzling Liempo',        'Served with java rice and soup.', 129.00),
  (1, 'Sizzling Burger Steak',  'Served with java rice and soup.', 129.00),
  (1, 'Sizzling Porkchop',      'Served with java rice and soup.', 139.00);

-- 2: Tapsilog Favorites (served with garlic rice and soup)
INSERT INTO menu_item (category_id, name, description, price) VALUES
  (2, 'Tocilog',        'Served with garlic rice and soup.', 129.00),
  (2, 'Chicksilog',     'Served with garlic rice and soup.', 119.00),
  (2, 'Liemposilog',    'Served with garlic rice and soup.', 119.00),
  (2, 'Hungariansilog', 'Served with garlic rice and soup.', 119.00),
  (2, 'Tapsilog',       'Served with garlic rice and soup.', 129.00),
  (2, 'Skinsilog',      'Served with garlic rice and soup.', 129.00),
  (2, 'Bangsilog',      'Served with garlic rice and soup.', 149.00);

-- 3: Student Meal (served with plain rice, egg and soup)
-- Names are prefixed with "Student" so they stay distinct from the sizzling items in carts and order history.
INSERT INTO menu_item (category_id, name, description, price) VALUES
  (3, 'Student Porkchop',      'Served with plain rice, egg and soup.', 99.00),
  (3, 'Student Skin Longanisa','Served with plain rice, egg and soup.', 99.00),
  (3, 'Student Hungarian',     'Served with plain rice, egg and soup.', 99.00),
  (3, 'Student Burger Steak',  'Served with plain rice, egg and soup.', 99.00);

-- 4: Drinks
INSERT INTO menu_item (category_id, name, description, price) VALUES
  (4, 'Royal 190ml',          NULL, 18.00),
  (4, 'Coke 190ml',           NULL, 18.00),
  (4, 'Bottled Water 500ml',  NULL, 20.00),
  (4, 'Sprite Mismo 290ml',   NULL, 25.00),
  (4, 'Coke Mismo 290ml',     NULL, 25.00),
  (4, 'Coke Regular 320ml',   NULL, 40.00),
  (4, 'Coke 1.5L',            NULL, 80.00),
  (4, 'Sprite 1.5L',          NULL, 80.00);

-- 5: Pastries
INSERT INTO menu_item (category_id, name, description, price) VALUES
  (5, 'Ensaymada',            NULL,  60.00),
  (5, 'Cinnamon (4pcs)',      NULL, 170.00);

-- 6: Rice & Extras
INSERT INTO menu_item (category_id, name, description, price) VALUES
  (6, 'Plain Rice',  NULL, 15.00),
  (6, 'Garlic Rice', NULL, 20.00),
  (6, 'Java Rice',   NULL, 25.00),
  (6, 'Egg',         NULL, 15.00);

-- ---------------------------------------------------------------
-- Dish photos (files live in public/images/order/). Items not listed
-- here (drinks, pastries, rice & extras) have no photo and stay NULL.
-- ---------------------------------------------------------------
UPDATE menu_item SET image_url='/images/order/sizzling/siz_sisig.jpg'       WHERE name='Sizzling Sisig';
UPDATE menu_item SET image_url='/images/order/sizzling/siz_chix.jpg'        WHERE name='Sizzling Chicken';
UPDATE menu_item SET image_url='/images/order/sizzling/siz_liempo.jpg'      WHERE name='Sizzling Liempo';
UPDATE menu_item SET image_url='/images/order/sizzling/siz_burgersteak.jpg' WHERE name='Sizzling Burger Steak';
UPDATE menu_item SET image_url='/images/order/sizzling/siz_porkchop.jpg'    WHERE name='Sizzling Porkchop';

UPDATE menu_item SET image_url='/images/order/silog/silog_toci.jpg'      WHERE name='Tocilog';
UPDATE menu_item SET image_url='/images/order/silog/silog_chix.jpg'      WHERE name='Chicksilog';
UPDATE menu_item SET image_url='/images/order/silog/silog_liempo.jpg'    WHERE name='Liemposilog';
UPDATE menu_item SET image_url='/images/order/silog/silog_hungarian.jpg' WHERE name='Hungariansilog';
UPDATE menu_item SET image_url='/images/order/silog/silog_tapsi.jpg'     WHERE name='Tapsilog';
UPDATE menu_item SET image_url='/images/order/silog/silog_skin.jpg'      WHERE name='Skinsilog';
UPDATE menu_item SET image_url='/images/order/silog/silog_bangus.jpg'    WHERE name='Bangsilog';

UPDATE menu_item SET image_url='/images/order/student_meal/sm_porkchop2.jpg' WHERE name='Student Porkchop';
UPDATE menu_item SET image_url='/images/order/student_meal/sm_skinless.jpg'  WHERE name='Student Skin Longanisa';
UPDATE menu_item SET image_url='/images/order/student_meal/sm_hungarian.jpg' WHERE name='Student Hungarian';
UPDATE menu_item SET image_url='/images/order/student_meal/sm_burgsteak.jpg' WHERE name='Student Burger Steak';
