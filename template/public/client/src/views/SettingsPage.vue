<script setup lang="ts">
import { Bell, Shield, Palette } from 'lucide-vue-next'
import Message from 'primevue/message'
import Tabs from 'primevue/tabs'
import TabList from 'primevue/tablist'
import Tab from 'primevue/tab'
import TabPanels from 'primevue/tabpanels'
import TabPanel from 'primevue/tabpanel'
import { useTheme, themes } from '@/composables/useTheme'

const { currentTheme, setTheme } = useTheme()
</script>

<template>
  <div class="min-h-screen">
    <header class="pt-10 pb-8 px-4 md:px-8">
      <div class="max-w-screen-lg mx-auto">
        <h1 class="text-3xl font-jakarta font-bold text-slate-900 mb-2">Settings</h1>
        <p class="text-slate-500 font-geist">Manage your account preferences and configuration.</p>
      </div>
    </header>

    <section class="px-4 md:px-8 pb-16">
      <div class="max-w-screen-lg mx-auto">
        <Message severity="info" :closable="false" class="mb-6">
          Settings are saved locally in this demo. Connect a backend to persist across devices.
        </Message>

        <Tabs value="appearance">
          <TabList>
            <Tab value="appearance" data-testid="settings-tab-appearance">
              <div class="flex items-center gap-2">
                <Palette :size="16" />
                <span>Appearance</span>
              </div>
            </Tab>
            <Tab value="notifications" data-testid="settings-tab-notifications">
              <div class="flex items-center gap-2">
                <Bell :size="16" />
                <span>Notifications</span>
              </div>
            </Tab>
            <Tab value="security" data-testid="settings-tab-security">
              <div class="flex items-center gap-2">
                <Shield :size="16" />
                <span>Security</span>
              </div>
            </Tab>
          </TabList>

          <TabPanels>
            <TabPanel value="appearance">
              <div class="py-6">
                <h2 class="text-lg font-jakarta font-semibold text-slate-900 mb-4">Theme</h2>
                <div class="grid grid-cols-2 sm:grid-cols-5 gap-3">
                  <button
                    v-for="theme in themes"
                    :key="theme.id"
                    :data-testid="`settings-theme-${theme.id}`"
                    class="flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all"
                    :class="currentTheme === theme.id
                      ? 'border-indigo-500 bg-indigo-50'
                      : 'border-slate-200 hover:border-slate-300'"
                    @click="setTheme(theme.id)"
                  >
                    <span
                      class="w-8 h-8 rounded-full"
                      :style="{ background: theme.swatch }"
                    />
                    <span class="text-sm font-geist" :class="currentTheme === theme.id ? 'text-indigo-700 font-semibold' : 'text-slate-600'">
                      {{ theme.label }}
                    </span>
                  </button>
                </div>
              </div>
            </TabPanel>

            <TabPanel value="notifications">
              <div class="py-6">
                <h2 class="text-lg font-jakarta font-semibold text-slate-900 mb-4">Notification Preferences</h2>
                <p class="text-sm text-slate-500 font-geist">Notification settings will be available once connected to a backend.</p>
              </div>
            </TabPanel>

            <TabPanel value="security">
              <div class="py-6">
                <h2 class="text-lg font-jakarta font-semibold text-slate-900 mb-4">Security Settings</h2>
                <p class="text-sm text-slate-500 font-geist">Security settings including password change and 2FA will be available once connected to a backend.</p>
              </div>
            </TabPanel>
          </TabPanels>
        </Tabs>
      </div>
    </section>
  </div>
</template>
