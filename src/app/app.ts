import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { UndoBar } from './core/undo/undo-bar';

@Component({
  imports: [RouterOutlet, UndoBar],
  selector: 'tn-root',
  styleUrl: './app.scss',
  templateUrl: './app.html',
})
export class App {}
