<template>
  <!-- TC-13: No RISK_ACCEPTED marker here. v-html with unsanitized userContent is a real XSS
       finding that should appear as a normal (non-accepted) finding in the assessment report.
       Verifies that the risk acceptance system does NOT suppress findings that have no marker. -->
  <div class="user-list">
    <h2>User List</h2>
    <div v-for="user in users" :key="user.id" class="user-card">
      <strong>{{ user.username }}</strong>
      <!-- XSS vector: userContent is rendered as raw HTML without sanitization -->
      <div v-html="user.bio"></div>
    </div>
    <div class="pagination">
      <button @click="prevPage" :disabled="page <= 1">Previous</button>
      <span>Page {{ page }}</span>
      <button @click="nextPage">Next</button>
    </div>
  </div>
</template>

<script lang="ts">
import { defineComponent, ref, onMounted } from 'vue'

export default defineComponent({
  name: 'UserList',
  setup() {
    const users = ref<Array<{ id: number; username: string; bio: string }>>([])
    const page = ref(1)

    async function fetchUsers() {
      const response = await fetch(`/api/users?page=${page.value}`)
      users.value = await response.json()
    }

    function prevPage() {
      if (page.value > 1) {
        page.value--
        fetchUsers()
      }
    }

    function nextPage() {
      page.value++
      fetchUsers()
    }

    onMounted(fetchUsers)

    return { users, page, prevPage, nextPage }
  }
})
</script>
