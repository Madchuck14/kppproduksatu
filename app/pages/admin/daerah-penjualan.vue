<script setup lang="ts">
import type { SalesDashboard } from '#shared/schemas/sales-dashboard'

definePageMeta({ middleware: ['admin', 'editor-super'] })
useSeoMeta({ title: 'Catatan Login | Editor', robots: 'noindex, nofollow' })
const route = useRoute()
const page = computed(() => {
  const value = Number(route.query.page ?? 1)
  return Number.isInteger(value) && value > 0 && value <= 100000 ? value : 1
})
const { data, error, status, refresh } = await useFetch<SalesDashboard>(
  '/api/admin/sales-dashboard',
  {
    query: { page },
  },
)
const dateFormatter = new Intl.DateTimeFormat('id-ID', {
  dateStyle: 'medium',
  timeStyle: 'long',
  timeZone: 'Asia/Jakarta',
})
function formatLogin(value: string | null) {
  return value ? dateFormatter.format(new Date(value)) : 'Belum pernah login'
}
</script>

<template>
  <section class="sales-dashboard" aria-labelledby="sales-dashboard-title">
    <div class="dashboard-heading">
      <div>
        <h1 id="sales-dashboard-title">Catatan Login</h1>
        <p>Catatan aktivitas login akun Sales dalam WIB.</p>
      </div>
      <UButton variant="outline" :loading="status === 'pending'" @click="refresh()">
        Muat ulang
      </UButton>
    </div>
    <p v-if="error" role="alert" class="dashboard-error">
      Catatan login belum dapat dimuat. Gunakan Muat ulang untuk mencoba lagi.
    </p>
    <p v-else-if="status === 'pending'" role="status">Memuat catatan login...</p>
    <template v-else-if="data">
      <div class="usage-summary" aria-label="Ringkasan aktivitas login">
        <div>
          <strong>{{ data.periods.today.loginEvents }}</strong
          ><span>Total login hari ini</span>
        </div>
        <div>
          <strong>{{ data.periods.week.loginEvents }}</strong
          ><span>Total login minggu ini</span>
        </div>
        <div>
          <strong>{{ data.periods.today.topAreas[0]?.loginEvents ?? 0 }}</strong>
          <span>Login terbanyak per wilayah hari ini</span>
          <p>
            {{
              data.periods.today.topAreas.map((item) => item.area).join(', ') ||
              'Belum ada wilayah login tercatat'
            }}
          </p>
        </div>
        <div>
          <strong>{{ data.periods.week.topAreas[0]?.loginEvents ?? 0 }}</strong>
          <span>Login terbanyak per wilayah minggu ini</span>
          <p>
            {{
              data.periods.week.topAreas.map((item) => item.area).join(', ') ||
              'Belum ada wilayah login tercatat'
            }}
          </p>
        </div>
      </div>
      <p class="directory-notice">
        Hari dimulai pukul 00.00 WIB; minggu dimulai Senin pukul 00.00 WIB. Angka menghitung login
        berhasil sampai pembaruan terakhir. Jika jumlahnya sama, seluruh wilayah dengan login
        terbanyak ditampilkan.
      </p>
      <p class="sales-count">{{ data.total }} akun Sales dalam catatan login</p>
      <div v-if="data.sales.length" class="table-container">
        <table>
          <caption class="sr-only">
            Catatan login akun Sales: nama, wilayah kerja, waktu, dan jumlah login
          </caption>
          <thead>
            <tr>
              <th scope="col">NIK</th>
              <th scope="col">Nama Sales</th>
              <th scope="col">Wilayah kerja akun</th>
              <th scope="col">Login terakhir (WIB)</th>
              <th scope="col">Jumlah login</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="sales in data.sales" :key="sales.id">
              <td>{{ sales.nip ?? 'NIK belum terhubung' }}</td>
              <td>{{ sales.name ?? 'Belum diisi pengelola' }}</td>
              <td>{{ sales.placement ?? 'Belum diisi pengelola' }}</td>
              <td>
                <time v-if="sales.lastLoginAt" :datetime="sales.lastLoginAt">
                  {{ formatLogin(sales.lastLoginAt) }}
                </time>
                <span v-else>Belum ada login tercatat</span>
              </td>
              <td>{{ sales.loginCount }}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p v-else class="empty-sales">Belum ada akun Sales untuk ditampilkan dalam catatan login.</p>
      <nav v-if="data.total > data.pageSize" class="pagination" aria-label="Halaman catatan login">
        <UButton
          v-if="data.page > 1"
          :to="{ path: route.path, query: { page: data.page - 1 } }"
          variant="outline"
          >Sebelumnya</UButton
        >
        <span>Halaman {{ data.page }} dari {{ Math.ceil(data.total / data.pageSize) }}</span>
        <UButton
          v-if="data.page * data.pageSize < data.total"
          :to="{ path: route.path, query: { page: data.page + 1 } }"
          variant="outline"
          >Berikutnya</UButton
        >
      </nav>
    </template>
  </section>
</template>

<style scoped>
.sales-dashboard {
  margin-top: 20px;
  padding: 28px;
  border: 1px solid #e6e8e4;
  border-radius: 20px;
  background: white;
}
.dashboard-heading {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  align-items: center;
  gap: 16px;
  margin-bottom: 24px;
}
h1 {
  font-size: 28px;
  font-weight: 600;
}
.dashboard-heading p,
.sales-count {
  color: #6b6f6b;
  font-size: 14px;
}
.directory-notice {
  padding: 14px 16px;
  border-radius: 12px;
  background: #f4f8f5;
  color: #1f5c3f;
  font-size: 14px;
}
.usage-summary {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 16px;
  margin-bottom: 20px;
}
.usage-summary > div {
  display: grid;
  gap: 4px;
  padding: 16px;
  border: 1px solid #e6e8e4;
  border-radius: 12px;
}
.usage-summary strong {
  color: #1f5c3f;
  font-size: 28px;
}
.usage-summary p {
  overflow-wrap: anywhere;
  color: #1f5c3f;
  font-size: 14px;
}
.usage-summary span {
  font-size: 13px;
}
.sales-count {
  margin-block: 16px;
}
.table-container {
  overflow-x: auto;
}
table {
  width: 100%;
  text-align: left;
  border-collapse: collapse;
  font-size: 14px;
}
th,
td {
  padding: 14px 12px;
  border-bottom: 1px solid #e6e8e4;
  min-width: 140px;
}
th {
  background: #f4f8f5;
  font-weight: 600;
}
.pagination {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: center;
  gap: 16px;
  margin-top: 24px;
}
.dashboard-error {
  color: #b3261e;
}
@media (max-width: 700px) {
  .sales-dashboard {
    padding: 20px 16px;
  }
  h1 {
    font-size: 24px;
  }
}
</style>
