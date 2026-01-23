# Güvenlik Politikası

## Desteklenen Versiyonlar

Aşağıdaki versiyonlar güvenlik güncellemeleri ile desteklenmektedir:

| Versiyon | Destekleniyor |
| ------- | ----------------- |
| 1.0.x   | :white_check_mark: |

## Güvenlik Açığı Bildirimi

Güvenlik açığı bulduysanız, lütfen doğrudan GitHub Issues üzerinden bildirmek yerine aşağıdaki yöntemi kullanın:

1. Güvenlik açığını detaylı bir şekilde açıklayın
2. Güvenlik açığını nasıl yeniden oluşturabileceğimizi açıklayın
3. Mümkünse, güvenlik açığını gösteren bir proof-of-concept ekleyin

Güvenlik açığı bildirimlerini şu adresten iletebilirsiniz:
- GitHub: https://github.com/3mreconf/confpass/security/advisories/new

## Güvenlik Özellikleri

- Tüm şifreler AES-256 ile şifrelenir
- Ana şifre hiçbir zaman saklanmaz veya gönderilmez
- Tüm veriler yerel olarak saklanır
- Hiçbir veri bulut sunucularına gönderilmez
- PBKDF2-HMAC-SHA256 ile güvenli anahtar türetme

## Güvenlik İlkeleri

- Düzenli güvenlik denetimleri
- Bağımlılık güncellemeleri
- Güvenlik açığı bildirimlerine hızlı yanıt
- Şeffaf güvenlik süreçleri
