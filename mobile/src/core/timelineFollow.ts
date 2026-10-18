// Measured distance during a programmatic jump is not a change in user intent.
export class TimelineFollow {
  following = true;
  private userScrolling = false;
  private awaitingMomentum = false;
  private distance = Infinity;
  jump() {
    this.userScrolling = false;
    this.awaitingMomentum = false;
    this.following = true;
  }
  leaveLatest() {
    this.userScrolling = false;
    this.awaitingMomentum = false;
    this.following = false;
  }
  beginDrag() {
    this.userScrolling = true;
    this.awaitingMomentum = false;
    this.following = false;
    this.distance = Infinity;
  }
  endDrag(velocity = 0) {
    this.userScrolling = false;
    this.awaitingMomentum = true;
    // A moving release still belongs to the user until momentum finishes.
    this.following = velocity === 0 && this.distance <= 2;
    return this.following;
  }
  beginMomentum() {
    // Animated programmatic jumps can emit momentum events too.
    if (this.awaitingMomentum) {
      this.userScrolling = true;
      this.following = false;
    }
    this.awaitingMomentum = false;
  }
  endMomentum() {
    if (this.userScrolling) this.following = this.distance <= 2;
    this.userScrolling = false;
    this.awaitingMomentum = false;
    return this.following;
  }
  observeDistance(distance: number) {
    if (this.userScrolling) this.distance = distance;
    return this.following;
  }
}
