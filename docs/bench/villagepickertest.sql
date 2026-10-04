INSERT INTO villages (name,name_hi,slug,latitude,longitude,distance_km,eta_minutes,is_active,is_popular,order_count) VALUES
 ('Fatanpur Bazaar','फतनपुर बाज़ार','fatanpur-bazaar',25.7420,81.9540,0.00,30,1,1,64),
 ('Raniganj','रानीगंज','raniganj',25.7601,81.9702,2.56,45,1,1,18),
 ('Bhagesar','भगेसर','bhagesar',25.7180,81.9310,3.42,50,1,0,7),
 ('Katra','कटरा','katra',25.7755,81.9385,3.87,50,1,0,3),
 ('Rampur','रामपुर','rampur',25.7290,81.9980,4.52,55,1,0,0),
 ('Antu','अंतू','antu',25.8130,82.0410,10.20,90,0,0,0);
INSERT INTO village_aliases (village_id,alias,alias_type) VALUES
 (2,'Rani Ganj','SPELLING'),(2,'raniganj','SPELLING'),(2,'रानी गंज','SPELLING'),
 (5,'Rampur Purwa','HAMLET'),(5,'रामपुर पुरवा','HAMLET'),
 (3,'Bhagesar Kala','HAMLET');
