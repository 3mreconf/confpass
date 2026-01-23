# ConfPass Password Manager - Gizlilik Politikası

**Son Güncelleme:** 2025-01-15

## Giriş

ConfPass Password Manager ("Biz", "Bizim" veya "Uygulama"), kullanıcıların gizliliğini korumayı taahhüt eder. Bu gizlilik politikası, ConfPass Password Manager tarayıcı eklentisi ve Windows masaüstü uygulamasının veri toplama, kullanma ve koruma uygulamalarını açıklar.

## Toplanan Veriler

### Kimlik Doğrulama Bilgileri
ConfPass, kullanıcıların web sitelerindeki giriş bilgilerini (kullanıcı adları ve şifreler) saklar. Bu bilgiler:
- Yalnızca kullanıcının kendi cihazında şifrelenmiş olarak saklanır
- AES-256 şifreleme standardı ile korunur
- Hiçbir zaman bulut sunucularına veya üçüncü taraflara gönderilmez
- Yalnızca kullanıcının kendi kontrolü altındadır

### Web Sitesi İçeriği
Eklenti, şifre alanlarını tespit etmek ve otomatik doldurma işlevini sağlamak için web sayfalarındaki form alanlarına erişir. Bu erişim:
- Yalnızca giriş formlarını tespit etmek için kullanılır
- Sayfa içeriği hiçbir zaman saklanmaz veya kaydedilmez
- Yalnızca şifre yönetimi işlevleri için kullanılır

## Veri Kullanımı

### Verileriniz Nasıl Kullanılır?
- **Şifre Yönetimi:** Giriş bilgilerinizi saklamak ve web sitelerinde otomatik olarak doldurmak için
- **Yerel Depolama:** Tüm verileriniz yalnızca cihazınızda şifrelenmiş olarak saklanır
- **Bağlantı Durumu:** Eklentinin Windows uygulaması ile bağlantı durumunu takip etmek için

### Verileriniz Paylaşılmaz
- Hiçbir veri üçüncü taraflarla paylaşılmaz
- Hiçbir veri bulut sunucularına gönderilmez
- Hiçbir veri satılmaz veya ticari amaçlarla kullanılmaz
- Hiçbir analitik veya izleme yapılmaz

## Veri Güvenliği

### Şifreleme
- Tüm şifre verileri AES-256 şifreleme ile korunur
- Ana şifreniz hiçbir zaman saklanmaz veya gönderilmez
- PBKDF2-HMAC-SHA256 ile türetilen şifreleme anahtarları kullanılır

### Yerel Depolama
- Tüm veriler yalnızca kullanıcının cihazında saklanır
- Windows: `%APPDATA%\ConfPass\` klasöründe
- Veriler hiçbir zaman buluta yüklenmez

## Veri Toplama ve İletişim

### Yerel İletişim
Eklenti, Windows masaüstü uygulaması ile iletişim kurmak için yerel HTTP sunucusuna (127.0.0.1:1421) bağlanır. Bu iletişim:
- Yalnızca kullanıcının yerel cihazında gerçekleşir
- Hiçbir veri dışarıya gönderilmez
- İnternet bağlantısı gerektirmez

## Veri Saklama

Kullanıcılar, verilerini istediği zaman silebilir. Uygulama kaldırıldığında, tüm veriler kullanıcının cihazından silinir.

## Kullanıcı Hakları

Kullanıcıların aşağıdaki hakları vardır:
- Verilerinize erişim
- Verilerinizi düzeltme
- Verilerinizi silme
- Veri taşınabilirliği (Export özelliği ile)

## Üçüncü Taraf Hizmetleri

ConfPass, hiçbir üçüncü taraf hizmeti kullanmaz. Tüm işlemler yerel olarak gerçekleşir.

## Çocukların Gizliliği

ConfPass, 13 yaşın altındaki çocuklardan bilerek veri toplamaz.

## Gizlilik Politikası Değişiklikleri

Bu gizlilik politikası zaman zaman güncellenebilir. Önemli değişiklikler, uygulama içinde bildirim ile kullanıcılara duyurulacaktır.

## İletişim

Gizlilik politikası hakkında sorularınız için:
- **Geliştirici:** emreconf
- **GitHub:** https://github.com/3mreconf/confpass

## Yasal Uyumluluk

Bu gizlilik politikası, GDPR (Genel Veri Koruma Yönetmeliği) ve diğer geçerli veri koruma yasalarına uygun olarak hazırlanmıştır.

---

**Not:** ConfPass, tüm verilerinizi yerel olarak saklar ve hiçbir veriyi dışarıya göndermez. Bu, gizliliğinizi en üst düzeyde korur.
