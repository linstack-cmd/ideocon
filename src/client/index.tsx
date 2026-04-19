import { render } from 'solid-js/web';
import { Router, Route } from '@solidjs/router';
import { App } from './app.js';
import './index.css';

const root = document.getElementById('root');
if (!root) throw new Error('Root element not found');

render(
  () => (
    <Router>
      <Route path="*" component={App} />
    </Router>
  ),
  root
);
