<script setup lang="ts">
defineProps<{ phibeta?: boolean }>()
</script>

<template>
  <div class="publisher-logos">
    <span class="erlangga-logo">
      <img src="/images/erlangga.png" alt="Penerbit Erlangga" width="112" height="44" />
    </span>
    <img
      v-if="phibeta"
      src="/images/phibeta.png"
      alt="Phibeta"
      width="112"
      height="44"
      class="phibeta-logo"
    />
    <img
      v-if="phibeta"
      src="/images/intelecto.png"
      alt="Intelecto"
      width="112"
      height="50"
      class="intelecto-logo"
    />
  </div>
</template>

<style scoped>
.publisher-logos {
  display: flex;
  align-items: center;
  gap: 20px;
}
.erlangga-logo {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 164px;
  height: 44px;
}
.erlangga-logo img {
  width: 100%;
  height: 100%;
  object-fit: contain;
}
.phibeta-logo {
  width: 112px;
  height: 44px;
  object-fit: contain;
}
.intelecto-logo {
  width: 112px;
  height: 50px;
  object-fit: contain;
}
</style>
