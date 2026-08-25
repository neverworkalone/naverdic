<script setup>
import SettingsShell from '/src/components/SettingsShell.vue'
import SettingsPage from '/src/components/SettingsPage.vue'
</script>

<template>
  <SettingsShell>
    <template #page="{ activePage, draft, draftSecrets, persistedSettings, persistedSecrets, draftRevision, draftResetRevision, isLoading, isSaving, resetDraft, onDraftRevision, translationPendingChange }">
      <SettingsPage
        :active-page="activePage"
        :draft="draft"
        :draft-secrets="draftSecrets"
        :persisted-settings="persistedSettings"
        :persisted-secrets="persistedSecrets"
        :draft-revision="draftRevision"
        :draft-reset-revision="draftResetRevision"
        :is-loading="isLoading"
        :is-saving="isSaving"
        :reset-draft="resetDraft"
        :on-draft-revision="onDraftRevision"
        :translation-pending-change="translationPendingChange"
      />
    </template>
  </SettingsShell>
</template>
