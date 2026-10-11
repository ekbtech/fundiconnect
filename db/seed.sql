USE fundiconnect;

INSERT INTO service_categories (name, slug, description, is_active)
VALUES
    ('Plumbing', 'plumbing', 'Plumbing installation, repair, and maintenance.', TRUE),
    ('Electrical services', 'electrical-services', 'Residential and commercial electrical work.', TRUE),
    ('Cleaning', 'cleaning', 'Home, office, and specialized cleaning services.', TRUE),
    ('Carpentry', 'carpentry', 'Furniture, cabinetry, and general carpentry.', TRUE),
    ('Painting', 'painting', 'Interior and exterior painting services.', TRUE),
    ('Appliance repair', 'appliance-repair', 'Repair and maintenance for household appliances.', TRUE),
    ('Mechanics', 'mechanics', 'Vehicle diagnostics, repair, and maintenance.', TRUE),
    ('Masonry and construction', 'masonry-construction', 'Masonry, renovation, and construction services.', TRUE),
    ('Gardening and landscaping', 'gardening-landscaping', 'Garden care and landscaping services.', TRUE),
    ('Moving and delivery', 'moving-delivery', 'Moving, transport, and delivery services.', TRUE)
ON DUPLICATE KEY UPDATE
    name = VALUES(name),
    description = VALUES(description),
    is_active = TRUE;
