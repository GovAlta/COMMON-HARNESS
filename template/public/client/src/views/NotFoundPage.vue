<script setup lang="ts">
import { useRouter } from 'vue-router'
import Button from 'primevue/button'

const router = useRouter()
</script>

<template>
  <div class="min-h-screen flex items-center justify-center px-4">
    <div class="text-center max-w-md">
      <p class="text-7xl font-jakarta font-bold text-indigo-600 mb-4">404</p>
      <h1 class="text-2xl font-jakarta font-bold text-slate-900 mb-2">Page Not Found</h1>
      <p class="text-slate-500 font-geist mb-8">
        The page you're looking for doesn't exist or has been moved.
      </p>
      <div class="flex gap-3 justify-center">
        <Button
          label="Go Back"
          icon="pi pi-arrow-left"
          severity="secondary"
          outlined
          @click="router.back()"
        />
        <Button
          label="Home"
          icon="pi pi-home"
          @click="router.push('/')"
        />
      </div>
    </div>
  </div>
</template>
