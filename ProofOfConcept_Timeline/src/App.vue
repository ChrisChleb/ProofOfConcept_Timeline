<script setup lang="ts">
import { RouterView } from 'vue-router'
import Snackbar, {type SnackbarData} from "@/components/Snackbar.vue";
import {provide, ref} from "vue";

const snackbar = ref<InstanceType<typeof Snackbar> | null>(null);
function showSnackbar(data: SnackbarData): void {
  snackbar.value?.show(data);
}
provide('showSnackbar', showSnackbar);
</script>

<template>
  <RouterView />
  <Snackbar ref="snackbar"></Snackbar>
</template>

<style scoped>

</style>
