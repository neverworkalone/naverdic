<script setup>
import SettingsShell from '/src/components/SettingsShell.vue'
import SettingsPage from '/src/components/SettingsPage.vue'
</script>

<template>
  <SettingsShell>
    <template #page="{ activePage, draft, draftSecrets, draftRevision, draftResetRevision, isLoading, isSaving, resetDraft, translationPendingChange }">
      <SettingsPage
        :active-page="activePage"
        :draft="draft"
        :draft-secrets="draftSecrets"
        :draft-revision="draftRevision"
        :draft-reset-revision="draftResetRevision"
        :is-loading="isLoading"
        :is-saving="isSaving"
        :reset-draft="resetDraft"
        :translation-pending-change="translationPendingChange"
      />
    </template>
  </SettingsShell>
</template>
