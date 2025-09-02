-- Gemini settings tablosuna yeni alanları ekle
ALTER TABLE gemini_settings 
ADD COLUMN use_ai_for_short_description BOOLEAN DEFAULT FALSE AFTER is_active,
ADD COLUMN use_ai_for_full_description BOOLEAN DEFAULT FALSE AFTER use_ai_for_short_description;

-- Mevcut kayıtları güncelle (varsa)
UPDATE gemini_settings 
SET 
  use_ai_for_short_description = FALSE,
  use_ai_for_full_description = FALSE 
WHERE 
  use_ai_for_short_description IS NULL 
  OR use_ai_for_full_description IS NULL;

-- Tablo yapısını kontrol et
DESCRIBE gemini_settings;
