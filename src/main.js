import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import './style.css'
import './assets/css/lyrics-modern.css'
import './assets/css/lyrics-classic.css'
import i18n from './i18n'

const app = createApp(App)
const pinia = createPinia()

app.use(pinia)
app.use(i18n)
app.mount('#app')