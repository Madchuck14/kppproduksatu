<script setup lang="ts">
useSeoMeta({
  title: 'Kontak | Penerbit Erlangga',
  description: 'Informasi kontak, lokasi kantor pusat, dan jam operasional Penerbit Erlangga.',
})
const address = 'Jl. H. Baping Raya No. 100, Ciracas, Jakarta Timur 13740'
const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`Penerbit Erlangga ${address}`)}`
const channels = [
  { name: 'Kantor pusat', icon: 'location', value: address, wide: true },
  {
    name: 'Email',
    icon: 'email',
    value: 'info@erlangga.co.id',
    href: 'mailto:info@erlangga.co.id',
  },
  { name: 'Telepon', icon: 'phone', value: '(021) 871 7006', href: 'tel:+62218717006' },
  { name: 'Fax', icon: 'fax', value: '(021) 877 946 09' },
  { name: 'Hotline', icon: 'hotline', value: '1500-885', href: 'tel:1500885' },
  {
    name: 'WhatsApp',
    icon: 'whatsapp',
    value: '08191-1500-885',
    href: 'https://wa.me/6281911500885',
    wide: true,
  },
]
const hours = [
  { day: 'Senin – Jumat', time: '08.00 – 17.00 WIB', icon: 'clock' },
  { day: 'Sabtu', time: '08.00 – 13.00 WIB', icon: 'saturday' },
]
</script>

<template>
  <div class="contact-page">
    <header class="contact-heading">
      <span class="section-badge">Informasi Kontak</span>
      <h1>Berbagai cara untuk <span>terhubung dengan kami</span></h1>
      <p>
        Pilih saluran komunikasi yang paling nyaman untuk Anda. Tim kami siap membantu pertanyaan
        seputar buku dan pemesanan.
      </p>
    </header>
    <section class="contact-grid" aria-label="Saluran komunikasi dan lokasi kantor">
      <div class="contact-channels">
        <component
          :is="item.href ? 'a' : 'div'"
          v-for="item in channels"
          :key="item.name"
          :href="item.href"
          class="contact-card"
          :class="{ 'wide-card': item.wide, 'linked-card': item.href }"
        >
          <span class="contact-icon"
            ><img :src="`/images/contact/${item.icon}.svg`" alt="" width="20" height="20"
          /></span>
          <div class="contact-value">
            <h2>{{ item.name }}</h2>
            <p>{{ item.value }}</p>
          </div>
          <span v-if="item.href" class="link-arrow" aria-hidden="true">↗</span>
        </component>
      </div>
      <div class="location-card">
        <div
          class="location-illustration"
          role="img"
          aria-label="Ilustrasi lokasi Kantor Pusat Erlangga di Ciracas"
        >
          <ContactMap />
        </div>
        <div class="location-details">
          <span class="contact-icon"
            ><img src="/images/contact/location.svg" alt="" width="20" height="20"
          /></span>
          <div>
            <h2>Kantor Pusat Erlangga</h2>
            <p>{{ address }}</p>
          </div>
          <a :href="mapsUrl" target="_blank" rel="noopener noreferrer" class="maps-link"
            >Buka di Google Maps<span class="sr-only"> (tab baru)</span></a
          >
        </div>
      </div>
    </section>
    <section class="opening-hours" aria-labelledby="hours-heading">
      <span class="section-badge">Jam Operasional</span>
      <h2 id="hours-heading">Kami siap melayani <span>setiap hari kerja</span></h2>
      <p>
        Tim dukungan kami aktif menerima pertanyaan dan keluhan melalui berbagai saluran komunikasi
        yang tersedia.
      </p>
      <div class="hours-grid">
        <div v-for="item in hours" :key="item.day" class="hours-card">
          <span class="hours-icon"
            ><img :src="`/images/contact/${item.icon}.svg`" alt="" width="20" height="20"
          /></span>
          <h3>{{ item.day }}</h3>
          <p>{{ item.time }}</p>
          <span>Siap melayani Anda</span>
        </div>
      </div>
    </section>
  </div>
</template>

<style scoped>
.contact-page {
  font-family: 'Inter', sans-serif;
  color: #222;
  display: grid;
  gap: 40px;
}
.contact-heading {
  padding-top: 44px;
  text-align: center;
}
.section-badge {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 3px 14px;
  border: 1px solid #e6e8e4;
  border-radius: 99px;
  background: #f4f8f5;
  color: #1f5c3f;
  font-size: 12.5px;
  font-weight: 500;
  line-height: 20px;
}
.section-badge::before {
  content: '';
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #1f5c3f;
}
.contact-heading h1 {
  margin: 16px 0 10px;
  font-family: 'Lora', serif;
  font-size: 46px;
  font-weight: 500;
  line-height: 1.2;
}
.contact-heading h1 span,
.opening-hours h2 span {
  color: #1f5c3f;
}
.contact-heading > p,
.opening-hours > p {
  max-width: 530px;
  margin: 0 auto;
  color: #6b6f6b;
  font-size: 15px;
  line-height: 24px;
}
.contact-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 24px;
  align-items: start;
}
.contact-channels {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}
.contact-card {
  min-width: 0;
  min-height: 126px;
  padding: 24px 18px;
  display: flex;
  align-items: center;
  gap: 14px;
  border: 1px solid #e6e8e4;
  border-radius: 16px;
}
.wide-card {
  grid-column: 1 / -1;
}
.contact-icon {
  display: flex;
  flex: 0 0 40px;
  width: 40px;
  height: 40px;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  background: #f4f8f5;
}
.contact-value {
  min-width: 0;
}
.contact-value h2 {
  margin: 0;
  font-size: 10.5px;
  font-weight: 400;
  text-transform: uppercase;
  letter-spacing: 0.63px;
  line-height: 17px;
  color: #6b6f6b;
}
.contact-value p {
  margin: 0;
  font-size: 14.5px;
  font-weight: 600;
  line-height: 23.2px;
  overflow-wrap: anywhere;
}
.link-arrow {
  margin-left: auto;
  color: #1f5c3f;
}
.linked-card:hover {
  border-color: #1f5c3f;
  background: #f7fbf8;
}
.location-card {
  border: 1px solid #e6e8e4;
  border-radius: 20px;
  overflow: hidden;
}
.location-illustration {
  pointer-events: none;
}
.location-details {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 16px 18px;
  border-top: 1px solid #e6e8e4;
}
.location-details > div {
  flex: 1;
  min-width: 0;
}
.location-details h2 {
  margin: 0;
  font-size: 15px;
  font-weight: 700;
  line-height: 24px;
}
.location-details p {
  margin: 0;
  color: #6b6f6b;
  font-size: 13px;
  line-height: 20.8px;
}
.maps-link {
  flex-shrink: 0;
  border: 1px solid #1f5c3f;
  border-radius: 12px;
  padding: 7px 16px;
  font-size: 14px;
  font-weight: 500;
  color: #1f5c3f;
}
.maps-link:hover {
  background: #f4f8f5;
}
.opening-hours {
  text-align: center;
  padding: 60px 32px 52px;
  background: #f4f8f5;
  border-radius: 24px;
}
.opening-hours h2 {
  margin: 15px 0 8px;
  font-family: 'Lora', serif;
  font-size: 36px;
  line-height: 1.2;
  font-weight: 500;
}
.hours-grid {
  max-width: 760px;
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16px;
  margin: 30px auto 0;
}
.hours-card {
  padding: 26px 24px;
  background: #fff;
  border: 1px solid #e6e8e4;
  border-radius: 18px;
}
.hours-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 46px;
  height: 46px;
  margin: 0 auto 13px;
  background: #f4f8f5;
  border-radius: 12px;
}
.hours-card h3 {
  margin: 0 0 6px;
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.66px;
  color: #1f5c3f;
}
.hours-card p {
  margin: 0 0 6px;
  font-family: 'Lora', serif;
  font-size: 26px;
  font-weight: 600;
  line-height: 33px;
}
.hours-card > span:last-child {
  color: #6b6f6b;
  font-size: 13px;
}
@media (max-width: 1100px) {
  .contact-grid {
    grid-template-columns: 1fr;
  }
  .location-details > div {
    max-width: none;
  }
}
@media (max-width: 600px) {
  .contact-heading {
    padding-top: 28px;
  }
  .contact-heading h1 {
    font-size: 32px;
  }
  .contact-channels,
  .hours-grid {
    grid-template-columns: 1fr;
  }
  .contact-card {
    min-height: 100px;
  }
  .location-details {
    flex-wrap: wrap;
  }
  .location-details > div {
    flex: 1 1 calc(100% - 54px);
  }
  .maps-link {
    margin-left: 54px;
  }
  .opening-hours {
    padding: 36px 18px;
  }
  .opening-hours h2 {
    font-size: 28px;
  }
}
</style>
