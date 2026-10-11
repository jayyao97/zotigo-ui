// Measured distance during a programmatic jump is not a change in user intent.
export class TimelineFollow {
  following = true;
  private userScrolling = false;
  private awaitingMomentum = false;
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
  }
  endDrag() {
    this.userScrolling = false;
    this.awaitingMomentum = true;
  }
  beginMomentum() {
    // Animated programmatic jumps can emit momentum events too.
    if (this.awaitingMomentum) this.userScrolling = true;
    this.awaitingMomentum = false;
  }
  endMomentum() {
    this.userScrolling = false;
    this.awaitingMomentum = false;
  }
  observeDistance(distance: number) {
    if (this.userScrolling) this.following = distance < 100;
    return this.following;
  }
}
