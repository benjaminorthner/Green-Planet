import { HomeScreen } from './homeScreen';
import { Game } from './game';

// Development flag - set to true to skip home screen
const DEV_MODE = false;

// Initialize the game
let game: Game | null = null;

if (DEV_MODE) {
  // Skip home screen in development mode
  document.getElementById('home-screen')!.style.display = 'none';
  game = new Game();
  game.start();
  document.getElementById('ui-container')!.style.display = 'block';
} else {
  // Show home screen in normal mode
  const homeScreen = new HomeScreen();
  
  // Start the game when the start button is clicked
  document.getElementById('start-button')?.addEventListener('click', () => {
    homeScreen.hide();
    if (!game) {
      game = new Game();
    }
    game.start();
    document.getElementById('ui-container')!.style.display = 'block';
  });

  // Initialize the home screen
  homeScreen.init();
}
