<script setup lang="ts">
defineProps<{ phibeta?: boolean }>()
</script>

<template>
  <div class="publisher-logos">
    <span class="erlangga-logo">
      <img src="/images/erlangga.png" alt="Penerbit Erlangga" width="164" height="164" />
    </span>
    <img
      v-if="phibeta"
      src="/images/phibeta.png"
      alt="Phibeta"
      width="112"
      height="44"
      class="phibeta-logo"
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
  display: block;
  position: relative;
  width: 164px;
  height: 44px;
  overflow: hidden;
}
.erlangga-logo img {
  position: absolute;
  width: 100%;
  max-width: none;
  height: auto;
  top: 50%;
  transform: translateY(-50%);
}
.phibeta-logo {
  width: 112px;
  height: 44px;
  object-fit: contain;
}
</style>
