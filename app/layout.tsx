import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata = {title:'Клинический компас — пространство заботы',description:'Кабинет врача и пациента. Карточки, личные заметки и связь с лечащим врачом.',icons:{icon:'/favicon.svg'}};
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="ru"><body>{children}</body></html>}
