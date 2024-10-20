import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { IonicModule } from '@ionic/angular';

import { VerReglamentoPageRoutingModule } from './ver-reglamento-routing.module';

import { VerReglamentoPage } from './ver-reglamento.page';

@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    IonicModule,
    VerReglamentoPageRoutingModule
  ],
  declarations: [VerReglamentoPage]
})
export class VerReglamentoPageModule {}
