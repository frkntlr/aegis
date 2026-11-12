# Proje komutu ve kota sonrası devam

## ENOENT: package.json bulunamadı

`npm run aegis` yalnızca Aegis motor deposundaki npm scriptini çalıştırır.
`Hake Game` gibi oyun/workspace köklerinde npm paketi gerekmez. Orada kullan:

```text
aegis teamwork plan "Mini oyun sure uyumsuzlugu, goz takip mini oyunu duzeltmeleri, acilis ve 10 yillik telefon performans optimizasyonu, arkadas meydan okuma kabul-reddet 404 cozumu" --client=codex --json
```

Terminal komutu planlar ve görevleri kaydeder. AI sohbetinde `$aegis tw <hedef>`
yerel ajan yürütmesini de ister. cwd hedef projede kalmalı; oyun görevlerini
motor klasörüne yazarak hatayı çözmeye çalışma.

PATH'te `aegis` yoksa `.aegis/installation.json` içindeki `command` Node dosyasını,
`args` kurulu CLI dosyasını gösterir. Bunları argüman sınırlarını koruyarak,
proje cwd'si ile çalıştır. Kullanıcı becerisinde aynı bilgi `runtime.json`
içindedir. Motor taşındıysa kurulumu yenile; boş `package.json` oluşturma.

## Kalıcı kesinti kaydı

Doğrulanmış sonuçlar `.aegis/codex-orchestra/<run-id>.json` içinde saklanır.
Bir ajan gerçekten durduğunda koordinatör kalan işi ve istemcinin gösterdiği
kota yenilenme zamanını kaydedebilir:

```text
aegis codex:orchestrate defer RUN_ID TASK_ID "Kota nedeniyle durdu" --resume-after=UTC_ISO_ZAMANI --agent-stopped --checkpoint="Değişen dosyalar, yapılan kontroller ve kalan iş"
```

Zaman `YYYY-MM-DDTHH:mm:ss.sssZ` biçiminde açık UTC olmalı; yer tutucu veya
tahminî kota süresi kullanılmaz. `--agent-stopped`, hâlâ çalışan ajan varken
kapasiteyi boşaltmamak için zorunludur. Checkpoint başarılı doğrulama kanıtı değildir.

Süreden önce görev dağıtılmaz. Süre dolunca bağımlılık, dosya kapsamı ve host
kapasitesi kontrolleri yine uygulanır. `next` rezervasyon verir; gerçek yürütmeyi
aktif koordinatör yerel ajan aracıyla başlatır.

## Kaldığın yeri bul

Hedef proje dizininde:

```text
aegis codex:orchestrate list
aegis codex:orchestrate recovery RUN_ID
aegis tw resume RUN_ID
```

AI sohbetinde `$aegis tw resume RUN_ID` kullanabilirsin. Resume çıktısı salt
okunur devam yönergeleridir; tek başına ajan başlatmaz veya işi tamamlandı saymaz.
Yeni koordinatör eski ajan durumlarını uzlaştırır, yarım dosya değişikliklerini
inceler ve yalnızca kalan işi dağıtır. Doğrulanmış tamamlanan görevler tekrarlanmaz.

Kota aniden biterse model son checkpoint'i yazamayabilir. Önceden saklanan
sonuçlar korunur; `running`/`reserved` görevler otomatik silinmez. Yeni oturum
ajanların gerçekten durduğunu doğrulayıp kesinti kaydını tamamlayabilir.

## Otomatik uyanma

Bir dosyaya zaman yazmak, kapalı AI sohbetini kendiliğinden uyandırmaz. Çıktıdaki
`automaticWakeScheduled: false`, gerçek host zamanlaması oluşturulmadığını belirtir.
Bu oturumda genel bir zamanlama oluşturma aracı sunulmadığı için otomatik uyanma
kurulmadı. İstemcinin Scheduled arayüzünde gerçek kota yenilenme saatini seçip
mevcut sohbet/proje için şu yönergeyi zamanlayabilirsin:

```text
$aegis tw resume RUN_ID
Bu projenin mevcut kaydını kullan. Ajan durumlarını uzlaştır; tamamlanan görevleri
tekrarlama. Kaydedilen resumeAfter zamanına uy. Kalan bağımsız işleri host
kapasitesinde dağıt ve sonuçlarını doğrula.
```

[OpenAI zamanlama rehberi](https://learn.chatgpt.com/docs/automations), yerel proje
görevleri için bilgisayarın ve masaüstü uygulamasının açık kalmasını şart koşar.
Özelliğin erişimi hesap/istemciye bağlıdır. Kota zamanını
[gerçek kullanım ekranından](https://learn.chatgpt.com/docs/pricing) al;
Aegis kotayı değiştirmez veya başka hesap/oturumla sınırı aşmaz.
