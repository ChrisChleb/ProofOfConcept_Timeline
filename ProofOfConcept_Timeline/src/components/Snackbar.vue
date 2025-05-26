<script lang="ts">
import {defineComponent} from 'vue'

export interface SnackbarData {
    message: string;
    color?: string;
    timer?: number;
    icon?: string;
}
export default defineComponent({
    name: "Snackbar",
    data() {
        return{
            showSnackbar: false,
            message: '',
            color: 'success',
            icon: 'mdi-check',
            timer: 3000
        }
    },
    methods:{
        show(data: SnackbarData) {
            this.message = data.message
            this.color = data.color || 'success'
            this.timer = data.timer || 3000
            this.icon = data.icon || 'mdi-check'
            this.showSnackbar = true
        }
    }
})
</script>

<template>
    <v-snackbar
        :color="color"
        :timeout="timer"
        v-model="showSnackbar"
        bottom
        right
    >
      <v-container class="d-flex">
        <v-row class="ga-2 align-center">
          <v-icon left>{{icon}}</v-icon>
          {{message}}
        </v-row>
      </v-container>
    </v-snackbar>
</template>

<style scoped>

</style>