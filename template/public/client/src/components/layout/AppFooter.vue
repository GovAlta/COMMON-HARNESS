<script setup lang="ts">
import { BarChart3, Github, Twitter, Mail } from 'lucide-vue-next'
</script>

<template>
  <footer class="border-t border-slate-200 bg-slate-50 mt-16" role="contentinfo">
    <div class="max-w-screen-2xl mx-auto px-4 md:px-8 py-12">
      <div class="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-8">
        <!-- Brand -->
        <div class="col-span-2 md:col-span-4 lg:col-span-1">
          <div class="flex items-center gap-3 mb-4">
            <div class="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center">
              <BarChart3 :size="18" class="text-white" />
            </div>
            <span class="font-jakarta font-bold text-lg text-slate-900">App Template</span>
          </div>
          <p class="text-sm text-slate-500 leading-relaxed mb-4">
            A production-ready Vue 3 application template with PrimeVue, Tailwind CSS, and best-practice architecture.
          </p>
          <div class="flex gap-3">
            <a href="#" class="text-slate-400 hover:text-slate-600 transition-colors" aria-label="GitHub">
              <Github :size="18" />
            </a>
            <a href="#" class="text-slate-400 hover:text-slate-600 transition-colors" aria-label="Twitter">
              <Twitter :size="18" />
            </a>
            <a href="#" class="text-slate-400 hover:text-slate-600 transition-colors" aria-label="Email">
              <Mail :size="18" />
            </a>
          </div>
        </div>

        <!-- Platform -->
        <div>
          <h3 class="font-geist font-semibold text-xs uppercase tracking-wider text-slate-900 mb-3">Platform</h3>
          <ul class="space-y-2">
            <li><router-link to="/dashboards" class="text-sm text-slate-500 hover:text-indigo-600 transition-colors">Dashboards</router-link></li>
            <li><router-link to="/explore" class="text-sm text-slate-500 hover:text-indigo-600 transition-colors">Explore Data</router-link></li>
            <li><router-link to="/docs/api" class="text-sm text-slate-500 hover:text-indigo-600 transition-colors">API Docs</router-link></li>
          </ul>
        </div>

        <!-- Resources -->
        <div>
          <h3 class="font-geist font-semibold text-xs uppercase tracking-wider text-slate-900 mb-3">Resources</h3>
          <ul class="space-y-2">
            <li><router-link to="/blog" class="text-sm text-slate-500 hover:text-indigo-600 transition-colors">Blog</router-link></li>
            <li><router-link to="/about" class="text-sm text-slate-500 hover:text-indigo-600 transition-colors">About</router-link></li>
            <li><router-link to="/contact" class="text-sm text-slate-500 hover:text-indigo-600 transition-colors">Contact</router-link></li>
          </ul>
        </div>

        <!-- Legal -->
        <div>
          <h3 class="font-geist font-semibold text-xs uppercase tracking-wider text-slate-900 mb-3">Legal</h3>
          <ul class="space-y-2">
            <li><a href="#" class="text-sm text-slate-500 hover:text-indigo-600 transition-colors">Privacy Policy</a></li>
            <li><a href="#" class="text-sm text-slate-500 hover:text-indigo-600 transition-colors">Terms of Service</a></li>
            <li><a href="#" class="text-sm text-slate-500 hover:text-indigo-600 transition-colors">License</a></li>
          </ul>
        </div>
      </div>

      <div class="border-t border-slate-200 mt-8 pt-6 text-center">
        <p class="text-xs text-slate-400">
          &copy; {{ new Date().getFullYear() }} App Template. Built with Vue 3, PrimeVue &amp; Tailwind CSS.
        </p>
      </div>
    </div>
  </footer>
</template>
